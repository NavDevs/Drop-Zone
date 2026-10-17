import express, { type Express } from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import { env } from './config.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.LOG_LEVEL === 'debug' ? { target: 'pino-pretty' } : undefined,
});

const app: Express = express();
const httpServer = createServer(app);

const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());

app.use(helmet());
app.use(cors({ origin: corsOrigins }));

export const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
  },
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Client connected');

  socket.on('disconnect', (reason) => {
    logger.info({ socketId: socket.id, reason }, 'Client disconnected');
  });
});

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Signaling server listening');
});

export { httpServer, app };
