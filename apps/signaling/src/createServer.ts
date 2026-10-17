import express, { type Express } from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import pino, { type Logger } from 'pino';
import { env, type EnvConfig } from './config.js';
import { RoomStore } from './rooms/RoomStore.js';
import { Limits, DEFAULT_LIMIT_POLICY, type LimitPolicy, extractIp } from './limits.js';
import { Metrics } from './metrics.js';
import { issueIceServers } from './ice.js';
import type { AppContext, AppServer, AppSocket } from './handlers/context.js';
import { handleRoomEvents, notifyRoomClosed } from './handlers/room.js';
import { handlePeerEvents, scheduleIceRefresh } from './handlers/peer.js';
import { handleSignalEvents } from './handlers/signal.js';

export interface ServerConfig {
  corsOrigins: string[];
  stunUrls: string;
  turnUrls: string;
  turnSecret: string;
  turnTtlSec: number;
  iceServersJson: string;
  metricsToken: string;
  logLevel: string;
  limitPolicy: LimitPolicy;
  now: () => number;
  sweepIntervalMs: number;
  enableSweeper: boolean;
  idleTimeoutSec?: number;
  hardMaxSec?: number;
}

export function configFromEnv(e: EnvConfig = env): ServerConfig {
  return {
    corsOrigins: e.CORS_ORIGINS.split(',').map((o) => o.trim()),
    stunUrls: e.STUN_URLS,
    turnUrls: e.TURN_URLS,
    turnSecret: e.TURN_SECRET,
    turnTtlSec: e.TURN_TTL_SECONDS,
    iceServersJson: e.ICE_SERVERS_JSON,
    metricsToken: e.METRICS_TOKEN,
    logLevel: e.LOG_LEVEL,
    limitPolicy: { ...DEFAULT_LIMIT_POLICY },
    now: Date.now,
    sweepIntervalMs: 30_000,
    enableSweeper: true,
  };
}

export interface SignalingServer {
  app: Express;
  io: AppServer;
  httpServer: HttpServer;
  store: RoomStore;
  metrics: Metrics;
  logger: Logger;
  config: ServerConfig;
  port(): number | undefined;
  close(): Promise<void>;
}

export function createSignalingServer(overrides: Partial<ServerConfig> & { metrics?: Metrics } = {}): SignalingServer {
  const config: ServerConfig = { ...configFromEnv(), ...overrides };
  const logger = pino({
    level: config.logLevel === 'silent' ? 'silent' : config.logLevel,
    transport: config.logLevel === 'debug' ? { target: 'pino-pretty' } : undefined,
  });
  const metrics = overrides.metrics ?? new Metrics();

  const limits = new Limits(config.limitPolicy);

  const app: Express = express();
  const httpServer = createServer(app);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));

  const io: AppServer = new Server(httpServer, {
    cors: { origin: config.corsOrigins, methods: ['GET', 'POST'] },
  });

  const store = new RoomStore({
    now: config.now,
    sweepIntervalMs: config.sweepIntervalMs,
    ...(config.idleTimeoutSec !== undefined ? { idleTimeoutSec: config.idleTimeoutSec } : {}),
    ...(config.hardMaxSec !== undefined ? { hardMaxSec: config.hardMaxSec } : {}),
    onClosed: (room, reason) => {
      notifyRoomClosed(io, room, reason);
      logger.info({ reason }, 'Swept expired room');
      metrics.roomsActive.set(store.size);
    },
  });

  const ctx: AppContext = {
    store,
    limits,
    ice: {
      issue(deviceId: string) {
        return issueIceServers(deviceId, {
          stunUrls: config.stunUrls,
          turnUrls: config.turnUrls,
          turnSecret: config.turnSecret,
          turnTtlSec: config.turnTtlSec,
          iceServersJson: config.iceServersJson,
          now: config.now,
        });
      },
    },
    metrics,
    logger,
    io,
    admit(socket: AppSocket, deviceId: string) {
      scheduleIceRefresh(ctx, socket, deviceId);
    },
  };

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/metrics', (req, res) => {
    if (!config.metricsToken) {
      res.status(404).end();
      return;
    }
    if (req.headers.authorization !== `Bearer ${config.metricsToken}`) {
      res.status(401).end();
      return;
    }
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics.render());
  });

  io.on('connection', (socket) => {
    metrics.socketsActive.inc();
    logger.info({ socketId: socket.id, ip: extractIp(socket.handshake.address) }, 'Client connected');

    handleRoomEvents(ctx, socket);
    handleSignalEvents(ctx, socket);
    handlePeerEvents(ctx, socket);

    socket.on('disconnect', () => {
      metrics.socketsActive.dec();
    });
  });

  if (config.enableSweeper) {
    store.startSweeper();
  }

  return {
    app,
    io,
    httpServer,
    store,
    metrics,
    logger,
    config,
    port() {
      const addr = httpServer.address();
      return typeof addr === 'object' && addr ? addr.port : undefined;
    },
    close() {
      return new Promise<void>((resolve) => {
        store.stopSweeper();
        io.close(() => {
          httpServer.close(() => resolve());
        });
      });
    },
  };
}
