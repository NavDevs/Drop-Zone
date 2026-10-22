import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { createSignalingServer, type SignalingServer } from '../src/createServer.js';
import type { DeviceInfo } from '@dropzone/protocol';
import { computeTurnCredential } from '../src/ice.js';

type Ack<T = unknown> = { error?: { code: string; message: string } } & T;

let server: SignalingServer;
let url: string;
const openSockets: ClientSocket[] = [];

function makeDevice(name = 'Test Device'): DeviceInfo {
  return { deviceId: randomUUID(), name, type: 'laptop' };
}

function connect(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = clientIo(url, { transports: ['websocket'], forceNew: true });
    openSockets.push(socket);
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function emitAck<T>(socket: ClientSocket, event: string, payload: unknown, timeoutMs = 3000): Promise<Ack<T>> {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: Ack<T>) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function createRoom(device: DeviceInfo, opts: { ttlSec?: number } = {}) {
  const socket = await connect();
  const ack = await emitAck<{ code: string; codeExpiresAt: number; iceServers: unknown[]; peers: unknown[] }>(
    socket,
    'room:create',
    { device, ...opts },
  );
  expect(ack.error).toBeUndefined();
  return { socket, ack: ack as { code: string; codeExpiresAt: number; iceServers: unknown[]; peers: unknown[] } };
}

beforeEach(async () => {
  server = createSignalingServer({
    logLevel: 'silent',
    enableSweeper: false,
    metricsToken: 'test-token',
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${server.port()}`;
});

afterEach(async () => {
  for (const s of openSockets.splice(0)) {
    s.disconnect();
  }
  await server.close();
});

describe('room:create', () => {
  it('returns a 6-char code, ICE servers, and empty peers', async () => {
    const device = makeDevice();
    const { ack } = await createRoom(device);
    expect(ack.code).toHaveLength(6);
    expect(ack.codeExpiresAt).toBeGreaterThan(Date.now());
    expect(Array.isArray(ack.iceServers)).toBe(true);
    expect(ack.iceServers.length).toBeGreaterThan(0); // at least STUN
    expect(ack.peers).toEqual([]);
  });

  it('rejects invalid payload with INVALID_PAYLOAD', async () => {
    const socket = await connect();
    const ack = await emitAck(socket, 'room:create', { device: { deviceId: 'nope' } });
    expect(ack.error?.code).toBe('INVALID_PAYLOAD');
  });

  it('rejects a second create from the same socket', async () => {
    const { socket } = await createRoom(makeDevice());
    const ack = await emitAck(socket, 'room:create', { device: makeDevice() });
    expect(ack.error?.code).toBe('INVALID_PAYLOAD');
  });

  it('rate-limits room creation', async () => {
    const limited = createSignalingServer({
      logLevel: 'silent',
      enableSweeper: false,
      limitPolicy: {
        roomCreateCount: 2,
        roomCreateWindowSec: 60,
        roomJoinCount: 10,
        roomJoinWindowSec: 60,
        joinFailThreshold: 5,
        joinFailLockoutSec: 900,
        signalCount: 100,
        signalWindowSec: 10,
      },
    });
    await new Promise<void>((resolve) => limited.httpServer.listen(0, resolve));
    const localUrl = `http://localhost:${limited.port()}`;
    const sockets: ClientSocket[] = [];
    try {
      const connectLocal = () =>
        new Promise<ClientSocket>((resolve, reject) => {
          const s = clientIo(localUrl, { transports: ['websocket'], forceNew: true });
          sockets.push(s);
          s.on('connect', () => resolve(s));
          s.on('connect_error', reject);
        });
      for (let i = 0; i < 2; i++) {
        const s = await connectLocal();
        const ack = await emitAck(s, 'room:create', { device: makeDevice() });
        expect(ack.error).toBeUndefined();
      }
      const s3 = await connectLocal();
      const ack3 = await emitAck(s3, 'room:create', { device: makeDevice() });
      expect(ack3.error?.code).toBe('RATE_LIMITED');
    } finally {
      for (const s of sockets) s.disconnect();
      await limited.close();
    }
  });
});

describe('room:join', () => {
  it('joins an existing room and learns about peers', async () => {
    const host = makeDevice('Host');
    const { socket: hostSocket, ack: hostAck } = await createRoom(host);

    const joiner = makeDevice('Joiner');
    const joined = waitForEvent<{ device: DeviceInfo }>(hostSocket, 'peer:joined');
    const joinSocket = await connect();
    const ack = await emitAck<{ code: string; peers: { device: DeviceInfo }[] }>(joinSocket, 'room:join', {
      code: hostAck.code,
      device: joiner,
    });
    expect(ack.error).toBeUndefined();
    expect(ack.code).toBe(hostAck.code);
    expect(ack.peers.some((p) => p.device.deviceId === host.deviceId)).toBe(true);
    const event = await joined;
    expect(event.device.deviceId).toBe(joiner.deviceId);
  });

  it('returns ROOM_NOT_FOUND for an unknown code', async () => {
    const socket = await connect();
    const ack = await emitAck(socket, 'room:join', { code: 'ZZZZZZ', device: makeDevice() });
    expect(ack.error?.code).toBe('ROOM_NOT_FOUND');
  });

  it('returns ROOM_EXPIRED after TTL passes; existing members unaffected', async () => {
    let now = Date.now();
    const expiring = createSignalingServer({
      logLevel: 'silent',
      enableSweeper: false,
      now: () => now,
    });
    await new Promise<void>((resolve) => expiring.httpServer.listen(0, resolve));
    const localUrl = `http://localhost:${expiring.port()}`;
    const sockets: ClientSocket[] = [];
    try {
      const connectLocal = () =>
        new Promise<ClientSocket>((resolve, reject) => {
          const s = clientIo(localUrl, { transports: ['websocket'], forceNew: true });
          sockets.push(s);
          s.on('connect', () => resolve(s));
          s.on('connect_error', reject);
        });
      const hostSocket = await connectLocal();
      const hostDevice = makeDevice();
      const created = await emitAck<{ code: string }>(hostSocket, 'room:create', { device: hostDevice, ttlSec: 300 });
      const code = (created as { code: string }).code;

      now += 301_000;
      const joinerSocket = await connectLocal();
      const ack = await emitAck(joinerSocket, 'room:join', { code, device: makeDevice() });
      expect(ack.error?.code).toBe('ROOM_EXPIRED');

      // host is still in the room (can still leave cleanly)
      const room = expiring.store.getByDevice(hostDevice.deviceId);
      expect(room).toBeDefined();
      expect(room?.peers.size).toBe(1);
    } finally {
      for (const s of sockets) s.disconnect();
      await expiring.close();
    }
  });

  it('rejects the 9th peer with ROOM_FULL', async () => {
    const { socket: hostSocket, ack: hostAck } = await createRoom(makeDevice());
    void hostSocket;
    for (let i = 0; i < 7; i++) {
      const s = await connect();
      const ack = await emitAck(s, 'room:join', { code: hostAck.code, device: makeDevice(`Peer ${i}`) });
      expect(ack.error).toBeUndefined();
    }
    const ninth = await connect();
    const ack = await emitAck(ninth, 'room:join', { code: hostAck.code, device: makeDevice('Ninth') });
    expect(ack.error?.code).toBe('ROOM_FULL');
  });

  it('rate-limits join attempts per IP', async () => {
    const limited = createSignalingServer({
      logLevel: 'silent',
      enableSweeper: false,
      limitPolicy: {
        roomCreateCount: 100,
        roomCreateWindowSec: 60,
        roomJoinCount: 3,
        roomJoinWindowSec: 60,
        joinFailThreshold: 5,
        joinFailLockoutSec: 900,
        signalCount: 100,
        signalWindowSec: 10,
      },
    });
    await new Promise<void>((resolve) => limited.httpServer.listen(0, resolve));
    const localUrl = `http://localhost:${limited.port()}`;
    const sockets: ClientSocket[] = [];
    try {
      const connectLocal = () =>
        new Promise<ClientSocket>((resolve, reject) => {
          const s = clientIo(localUrl, { transports: ['websocket'], forceNew: true });
          sockets.push(s);
          s.on('connect', () => resolve(s));
          s.on('connect_error', reject);
        });
      const hostS = await connectLocal();
      const created = await emitAck<{ code: string }>(hostS, 'room:create', { device: makeDevice() });
      const code = (created as { code: string }).code;
      // 3 successful joins allowed
      for (let i = 0; i < 3; i++) {
        const s = await connectLocal();
        const ack = await emitAck(s, 'room:join', { code, device: makeDevice() });
        expect(ack.error).toBeUndefined();
      }
      const s4 = await connectLocal();
      const ack4 = await emitAck(s4, 'room:join', { code, device: makeDevice() });
      expect(ack4.error?.code).toBe('RATE_LIMITED');
    } finally {
      for (const s of sockets) s.disconnect();
      await limited.close();
    }
  });

  it('locks out after repeated failed joins', async () => {
    const limited = createSignalingServer({
      logLevel: 'silent',
      enableSweeper: false,
      limitPolicy: {
        roomCreateCount: 100,
        roomCreateWindowSec: 60,
        roomJoinCount: 100,
        roomJoinWindowSec: 60,
        joinFailThreshold: 2,
        joinFailLockoutSec: 900,
        signalCount: 100,
        signalWindowSec: 10,
      },
    });
    await new Promise<void>((resolve) => limited.httpServer.listen(0, resolve));
    const localUrl = `http://localhost:${limited.port()}`;
    const sockets: ClientSocket[] = [];
    try {
      const connectLocal = () =>
        new Promise<ClientSocket>((resolve, reject) => {
          const s = clientIo(localUrl, { transports: ['websocket'], forceNew: true });
          sockets.push(s);
          s.on('connect', () => resolve(s));
          s.on('connect_error', reject);
        });
      const s = await connectLocal();
      for (let i = 0; i < 2; i++) {
        const ack = await emitAck(s, 'room:join', { code: 'ZZZZZZ', device: makeDevice() });
        expect(ack.error?.code).toBe('ROOM_NOT_FOUND');
      }
      // lockout now active — even a valid room is refused
      const hostS = await connectLocal();
      const created = await emitAck<{ code: string }>(hostS, 'room:create', { device: makeDevice() });
      const s2 = await connectLocal();
      const ack2 = await emitAck(s2, 'room:join', { code: (created as { code: string }).code, device: makeDevice() });
      expect(ack2.error?.code).toBe('RATE_LIMITED');
    } finally {
      for (const s of sockets) s.disconnect();
      await limited.close();
    }
  });
});

describe('signal relay', () => {
  it('relays description and candidate within a room', async () => {
    const host = makeDevice();
    const { socket: hostSocket, ack: hostAck } = await createRoom(host);
    const joiner = makeDevice();
    const joinSocket = await connect();
    await emitAck(joinSocket, 'room:join', { code: hostAck.code, device: joiner });

    const received = waitForEvent<{ from: string; kind: string; data: unknown }>(joinSocket, 'signal');
    const ack = await emitAck(hostSocket, 'signal', {
      to: joiner.deviceId,
      kind: 'description',
      data: { sdp: 'fake-offer' },
    });
    expect(ack.error).toBeUndefined();
    const payload = await received;
    expect(payload.from).toBe(host.deviceId);
    expect(payload.kind).toBe('description');
    expect(payload.data).toEqual({ sdp: 'fake-offer' });
  });

  it('rejects signals to peers in other rooms (isolation)', async () => {
    const { socket: socketA } = await createRoom(makeDevice());
    const { socket: socketB } = await createRoom(makeDevice());
    const stranger = makeDevice();
    const ack = await emitAck(socketA, 'signal', { to: stranger.deviceId, kind: 'candidate', data: {} });
    expect(ack.error?.code).toBe('PEER_NOT_FOUND');
    void socketB;
  });

  it('rejects signals when not in a room', async () => {
    const socket = await connect();
    const ack = await emitAck(socket, 'signal', { to: randomUUID(), kind: 'candidate', data: {} });
    expect(ack.error?.code).toBe('NOT_IN_ROOM');
  });

  it('rejects payloads over 16 KB', async () => {
    const host = makeDevice();
    const { socket: hostSocket, ack: hostAck } = await createRoom(host);
    const joiner = makeDevice();
    const joinSocket = await connect();
    await emitAck(joinSocket, 'room:join', { code: hostAck.code, device: joiner });
    const big = 'x'.repeat(20_000);
    const ack = await emitAck(hostSocket, 'signal', { to: joiner.deviceId, kind: 'description', data: big });
    expect(ack.error?.code).toBe('INVALID_PAYLOAD');
  });

  it('rate-limits signals per socket', async () => {
    const limited = createSignalingServer({
      logLevel: 'silent',
      enableSweeper: false,
      limitPolicy: {
        roomCreateCount: 100,
        roomCreateWindowSec: 60,
        roomJoinCount: 100,
        roomJoinWindowSec: 60,
        joinFailThreshold: 5,
        joinFailLockoutSec: 900,
        signalCount: 3,
        signalWindowSec: 10,
      },
    });
    await new Promise<void>((resolve) => limited.httpServer.listen(0, resolve));
    const localUrl = `http://localhost:${limited.port()}`;
    const sockets: ClientSocket[] = [];
    try {
      const connectLocal = () =>
        new Promise<ClientSocket>((resolve, reject) => {
          const s = clientIo(localUrl, { transports: ['websocket'], forceNew: true });
          sockets.push(s);
          s.on('connect', () => resolve(s));
          s.on('connect_error', reject);
        });
      const hostDevice = makeDevice();
      const hostS = await connectLocal();
      const created = await emitAck<{ code: string }>(hostS, 'room:create', { device: hostDevice });
      const joiner = makeDevice();
      const joinS = await connectLocal();
      await emitAck(joinS, 'room:join', { code: (created as { code: string }).code, device: joiner });
      for (let i = 0; i < 3; i++) {
        const ack = await emitAck(hostS, 'signal', { to: joiner.deviceId, kind: 'candidate', data: { i } });
        expect(ack.error).toBeUndefined();
      }
      const ack4 = await emitAck(hostS, 'signal', { to: joiner.deviceId, kind: 'candidate', data: { i: 4 } });
      expect(ack4.error?.code).toBe('RATE_LIMITED');
    } finally {
      for (const s of sockets) s.disconnect();
      await limited.close();
    }
  });
});

describe('presence, leave, and disconnect', () => {
  it('broadcasts peer:left on room:leave and cleans up empty rooms', async () => {
    const host = makeDevice();
    const { socket: hostSocket, ack: hostAck } = await createRoom(host);
    const joiner = makeDevice();
    const joinSocket = await connect();
    await emitAck(joinSocket, 'room:join', { code: hostAck.code, device: joiner });

    const left = waitForEvent<{ deviceId: string }>(hostSocket, 'peer:left');
    const ack = await emitAck(joinSocket, 'room:leave', {});
    expect(ack.error).toBeUndefined();
    const payload = await left;
    expect(payload.deviceId).toBe(joiner.deviceId);

    // after host leaves too, the room is gone
    await emitAck(hostSocket, 'room:leave', {});
    expect(server.store.getByCode(hostAck.code)).toBeUndefined();
    const rejoin = await connect();
    const rejoinAck = await emitAck(rejoin, 'room:join', { code: hostAck.code, device: makeDevice() });
    expect(rejoinAck.error?.code).toBe('ROOM_NOT_FOUND');
  });

  it('a socket can join another room after room:leave', async () => {
    const { ack: first } = await createRoom(makeDevice());
    const joinSocket = await connect();
    await emitAck(joinSocket, 'room:join', { code: first.code, device: makeDevice() });
    const leaveAck = await emitAck(joinSocket, 'room:leave', {});
    expect(leaveAck.error).toBeUndefined();

    const second = await createRoom(makeDevice());
    const rejoinAck = await emitAck(joinSocket, 'room:join', { code: second.ack.code, device: makeDevice('Again') });
    expect(rejoinAck.error).toBeUndefined();
  });

  it('a socket can create a new room after leaving as last member', async () => {
    const { socket } = await createRoom(makeDevice());
    const leaveAck = await emitAck(socket, 'room:leave', {});
    expect(leaveAck.error).toBeUndefined();
    const again = await emitAck<{ code: string }>(socket, 'room:create', { device: makeDevice('Second') });
    expect(again.error).toBeUndefined();
    expect((again as { code: string }).code).toHaveLength(6);
  });

  it('sockets can act again after the host closes the room', async () => {
    const { socket: hostSocket, ack: hostAck } = await createRoom(makeDevice());
    const joinSocket = await connect();
    await emitAck(joinSocket, 'room:join', { code: hostAck.code, device: makeDevice() });

    await emitAck(hostSocket, 'room:close', {});

    // host (closer) can immediately create another room on the same socket
    const again = await emitAck<{ code: string }>(hostSocket, 'room:create', { device: makeDevice('Host2') });
    expect(again.error).toBeUndefined();

    // the other member (who only received room:closed) can also join elsewhere
    const other = await createRoom(makeDevice());
    const joinAck = await emitAck(joinSocket, 'room:join', { code: other.ack.code, device: makeDevice('Mover') });
    expect(joinAck.error).toBeUndefined();
  });

  it('broadcasts peer:left on socket disconnect', async () => {
    const host = makeDevice();
    const { socket: hostSocket, ack: hostAck } = await createRoom(host);
    const joiner = makeDevice();
    const joinSocket = await connect();
    await emitAck(joinSocket, 'room:join', { code: hostAck.code, device: joiner });

    const left = waitForEvent<{ deviceId: string }>(hostSocket, 'peer:left');
    joinSocket.disconnect();
    const payload = await left;
    expect(payload.deviceId).toBe(joiner.deviceId);
  });

  it('propagates device rename via peer:updated', async () => {
    const host = makeDevice();
    const { socket: hostSocket, ack: hostAck } = await createRoom(host);
    const joiner = makeDevice('Old Name');
    const joinSocket = await connect();
    await emitAck(joinSocket, 'room:join', { code: hostAck.code, device: joiner });

    const updated = waitForEvent<{ device: DeviceInfo }>(hostSocket, 'peer:updated');
    const ack = await emitAck(joinSocket, 'device:update', { name: 'New Name' });
    expect(ack.error).toBeUndefined();
    const payload = await updated;
    expect(payload.device.name).toBe('New Name');
    expect(payload.device.deviceId).toBe(joiner.deviceId);
  });
});

describe('host powers: regenerate, close, approve', () => {
  it('regenerate invalidates the old code and notifies peers', async () => {
    const host = makeDevice();
    const { socket: hostSocket, ack: hostAck } = await createRoom(host);
    const joiner = makeDevice();
    const joinSocket = await connect();
    await emitAck(joinSocket, 'room:join', { code: hostAck.code, device: joiner });

    const changed = waitForEvent<{ code: string }>(joinSocket, 'room:codeChanged');
    const ack = await emitAck<{ code: string }>(hostSocket, 'room:regenerate', {});
    expect(ack.error).toBeUndefined();
    const newCode = (ack as { code: string }).code;
    expect(newCode).not.toBe(hostAck.code);
    expect((await changed).code).toBe(newCode);

    // old code is dead
    const s = await connect();
    const oldAck = await emitAck(s, 'room:join', { code: hostAck.code, device: makeDevice() });
    expect(oldAck.error?.code).toBe('ROOM_NOT_FOUND');
    // new code works
    const s2 = await connect();
    const newAck = await emitAck(s2, 'room:join', { code: newCode, device: makeDevice() });
    expect(newAck.error).toBeUndefined();
  });

  it('only the host can regenerate', async () => {
    const { socket: hostSocket, ack: hostAck } = await createRoom(makeDevice());
    const joinSocket = await connect();
    await emitAck(joinSocket, 'room:join', { code: hostAck.code, device: makeDevice() });
    const ack = await emitAck(joinSocket, 'room:regenerate', {});
    expect(ack.error?.code).toBe('NOT_HOST');
    void hostSocket;
  });

  it('host closes the room for everyone', async () => {
    const host = makeDevice();
    const { socket: hostSocket, ack: hostAck } = await createRoom(host);
    const joiner = makeDevice();
    const joinSocket = await connect();
    await emitAck(joinSocket, 'room:join', { code: hostAck.code, device: joiner });

    const closedForJoiner = waitForEvent<{ reason: string }>(joinSocket, 'room:closed');
    const ack = await emitAck(hostSocket, 'room:close', {});
    expect(ack.error).toBeUndefined();
    expect((await closedForJoiner).reason).toBe('HOST_CLOSED');
    expect(server.store.getByCode(hostAck.code)).toBeUndefined();
  });

  it('only the host can close the room', async () => {
    const { socket: hostSocket, ack: hostAck } = await createRoom(makeDevice());
    const joinSocket = await connect();
    await emitAck(joinSocket, 'room:join', { code: hostAck.code, device: makeDevice() });
    const ack = await emitAck(joinSocket, 'room:close', {});
    expect(ack.error?.code).toBe('NOT_HOST');
    void hostSocket;
  });
});

describe('ICE credentials', () => {
  it('issues HMAC-SHA1 TURN credentials', async () => {
    const turnServer = createSignalingServer({
      logLevel: 'silent',
      enableSweeper: false,
      stunUrls: 'stun:stun.example.com:3478',
      turnUrls: 'turn:turn.example.com:3478?transport=udp',
      turnSecret: 'server-secret',
      turnTtlSec: 3600,
    });
    await new Promise<void>((resolve) => turnServer.httpServer.listen(0, resolve));
    const localUrl = `http://localhost:${turnServer.port()}`;
    const sockets: ClientSocket[] = [];
    try {
      const device = makeDevice();
      const socket = await new Promise<ClientSocket>((resolve, reject) => {
        const s = clientIo(localUrl, { transports: ['websocket'], forceNew: true });
        sockets.push(s);
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });
      const ack = await emitAck<{ iceServers: { urls: unknown; username?: string; credential?: string }[] }>(
        socket,
        'room:create',
        { device },
      );
      const turn = ack.iceServers.find((s) => String(s.urls).includes('turn:'));
      expect(turn).toBeDefined();
      const [expiry, id] = (turn?.username ?? '').split(':');
      expect(id).toBe(device.deviceId);
      expect(turn?.credential).toBe(computeTurnCredential('server-secret', `${expiry}:${id}`));
      expect(Number(expiry)).toBeGreaterThan(Math.floor(Date.now() / 1000));
    } finally {
      for (const s of sockets) s.disconnect();
      await turnServer.close();
    }
  });
});

describe('room expiry sweeper', () => {
  it('closes idle rooms and notifies members', async () => {
    const sweeping = createSignalingServer({
      logLevel: 'silent',
      sweepIntervalMs: 50,
      idleTimeoutSec: 120,
    });
    await new Promise<void>((resolve) => sweeping.httpServer.listen(0, resolve));
    const localUrl = `http://localhost:${sweeping.port()}`;
    const sockets: ClientSocket[] = [];
    try {
      const connectLocal = () =>
        new Promise<ClientSocket>((resolve, reject) => {
          const s = clientIo(localUrl, { transports: ['websocket'], forceNew: true });
          sockets.push(s);
          s.on('connect', () => resolve(s));
          s.on('connect_error', reject);
        });
      const socket = await connectLocal();
      const created = await emitAck<{ code: string }>(socket, 'room:create', { device: makeDevice() });
      // force idle expiry by rewinding lastActivityAt
      const room = sweeping.store.getByCode((created as { code: string }).code);
      expect(room).toBeDefined();
      if (room) room.lastActivityAt = Date.now() - 121_000;
      const closed = waitForEvent<{ reason: string }>(socket, 'room:closed', 5000);
      expect((await closed).reason).toBe('IDLE_TIMEOUT');
      expect(sweeping.store.getByCode((created as { code: string }).code)).toBeUndefined();
    } finally {
      for (const s of sockets) s.disconnect();
      await sweeping.close();
    }
  });
});

describe('REST endpoints', () => {
  it('GET /healthz returns ok', async () => {
    const res = await fetch(`http://localhost:${server.port()}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('GET /metrics requires bearer token', async () => {
    const noAuth = await fetch(`http://localhost:${server.port()}/metrics`);
    expect(noAuth.status).toBe(401);
    const badAuth = await fetch(`http://localhost:${server.port()}/metrics`, {
      headers: { Authorization: 'Bearer wrong' },
    });
    expect(badAuth.status).toBe(401);
    const ok = await fetch(`http://localhost:${server.port()}/metrics`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(ok.status).toBe(200);
    const text = await ok.text();
    expect(text).toContain('rooms_active');
    expect(text).toContain('sockets_active');
  });

  it('GET /metrics returns 404 when no token configured', async () => {
    const noToken = createSignalingServer({ logLevel: 'silent', enableSweeper: false, metricsToken: '' });
    await new Promise<void>((resolve) => noToken.httpServer.listen(0, resolve));
    try {
      const res = await fetch(`http://localhost:${noToken.port()}/metrics`);
      expect(res.status).toBe(404);
    } finally {
      await noToken.close();
    }
  });
});
