import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock socket.io-client so we can drive the socket by hand.
const { mockSocket } = vi.hoisted(() => {
  const handlers: Record<string, ((payload: unknown) => void)[]> = {};
  const mockSocket = {
    connected: true,
    on: vi.fn((event: string, cb: (payload: unknown) => void) => {
      (handlers[event] ??= []).push(cb);
    }),
    once: vi.fn((event: string, cb: (payload: unknown) => void) => {
      (handlers[event] ??= []).push(cb);
    }),
    emit: vi.fn(),
    timeout: vi.fn(() => ({ emit: mockSocket.emit.bind(mockSocket) })),
    disconnect: vi.fn(),
    connect: vi.fn(),
    io: { on: vi.fn() },
    // test helper: fire a server event
    __fire: (event: string, payload: unknown) => {
      for (const cb of handlers[event] ?? []) cb(payload);
    },
    __reset: () => {
      for (const k of Object.keys(handlers)) delete handlers[k];
    },
  };
  return { mockSocket };
});

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    // Mimic socket.io: connect is async. Flush the current microtask/macrotask
    // queue so `connect()`'s once('connect') handler is registered first, then fire.
    setTimeout(() => mockSocket.__fire('connect', undefined), 0);
    return mockSocket;
  }),
}));

const { SignalingClient, getSignalingUrl } = await import('../lib/signaling/SignalingClient.js');
const { useRoomStore } = await import('../state/roomStore.js');
const { usePeersStore } = await import('../state/peersStore.js');

const device = (id: string, name = id, type: 'desktop' | 'phone' = 'desktop') => ({
  deviceId: id,
  name,
  type,
});

describe('SignalingClient', () => {
  let client: InstanceType<typeof SignalingClient>;

  beforeEach(async () => {
    mockSocket.__reset();
    mockSocket.emit.mockClear();
    useRoomStore.getState().clear();
    usePeersStore.getState().reset();
    client = new SignalingClient();
    await client.connect('http://test');
  });

  it('sets joined + host on a createRoom ack', async () => {
    mockSocket.emit.mockImplementation((_e: string, _p: unknown, ack?: (err: null, res: unknown) => void) => {
      ack?.(null, {
        code: 'ABC234',
        codeExpiresAt: Date.now() + 60_000,
        iceServers: [],
      });
    });

    const res = await client.createRoom(device('host-1'), { ttlSec: 600 });
    expect(res.ok).toBe(true);
    const s = useRoomStore.getState();
    expect(s.status).toBe('joined');
    expect(s.code).toBe('ABC234');
    expect(s.isHost).toBe(true);
  });

  it('maps a createRoom error envelope into store error', async () => {
    mockSocket.emit.mockImplementation((_e: string, _p: unknown, ack?: (err: null, res: unknown) => void) => {
      ack?.(null, { error: { code: 'RATE_LIMITED', message: 'slow down' } });
    });

    const res = await client.createRoom(device('host-1'));
    expect(res.ok).toBe(false);
    expect(useRoomStore.getState().error?.code).toBe('RATE_LIMITED');
  });

  it('joinRoom success populates peers excluding self', async () => {
    usePeersStore.getState().setSelfId('me');
    mockSocket.emit.mockImplementation((_e: string, p: unknown, ack?: (err: null, res: unknown) => void) => {
      const payload = p as { device: { deviceId: string } };
      const roster = [
        { device: payload.device, joinedAt: 1 },
        { device: device('other', 'Other'), joinedAt: 2 },
      ];
      ack?.(null, { code: 'ABC234', codeExpiresAt: Date.now() + 1000, iceServers: [], peers: roster });
    });

    await client.joinRoom('ABC234', device('me', 'Me'));
    expect(Object.keys(usePeersStore.getState().peers)).toEqual(['other']);
    expect(useRoomStore.getState().status).toBe('joined');
    expect(useRoomStore.getState().isHost).toBe(false);
  });

  it('peer:joined event upserts a peer; self is ignored', () => {
    usePeersStore.getState().setSelfId('me');
    mockSocket.__fire('peer:joined', { device: device('other', 'Other'), joinedAt: 1 });
    expect(Object.keys(usePeersStore.getState().peers)).toEqual(['other']);

    mockSocket.__fire('peer:joined', { device: device('me', 'Me'), joinedAt: 1 });
    expect(Object.keys(usePeersStore.getState().peers)).toEqual(['other']);
  });

  it('peer:left removes the peer', () => {
    usePeersStore.getState().setSelfId('me');
    mockSocket.__fire('peer:joined', { device: device('other'), joinedAt: 1 });
    mockSocket.__fire('peer:left', { deviceId: 'other' });
    expect(Object.keys(usePeersStore.getState().peers)).toHaveLength(0);
  });

  it('room:closed clears room + sets error', () => {
    useRoomStore.getState().setJoined({ code: 'ABC234', isHost: false, codeExpiresAt: 1, iceServers: [] });
    mockSocket.__fire('room:closed', { reason: 'HOST_CLOSED' });
    const s = useRoomStore.getState();
    expect(s.status).toBe('error');
    expect(s.code).toBeNull();
    expect(s.error?.code).toBe('ROOM_CLOSED');
  });

  it('room:codeChanged updates the code + expiry', () => {
    useRoomStore.getState().setJoined({ code: 'OLD111', isHost: false, codeExpiresAt: 1, iceServers: [] });
    mockSocket.__fire('room:codeChanged', { code: 'NEW222', codeExpiresAt: 99 });
    expect(useRoomStore.getState().code).toBe('NEW222');
    expect(useRoomStore.getState().codeExpiresAt).toBe(99);
  });

  it('a socket.io ack timeout maps to a NETWORK result', async () => {
    // Join first so serverBoundCode is set (otherwise leaveRoom skips the emit).
    mockSocket.emit.mockImplementation((_e: string, _p: unknown, ack?: (err: null, res: unknown) => void) => {
      ack?.(null, { code: 'ABC234', codeExpiresAt: Date.now() + 1000, iceServers: [], peers: [] });
    });
    await client.joinRoom('ABC234', device('me', 'Me'));

    // Simulate socket.io's timeout: ack is invoked with an Error.
    mockSocket.emit.mockImplementation((_e: string, _p: unknown, ack?: (err: Error | null) => void) => {
      ack?.(new Error('timeout'));
    });

    await client.leaveRoom();
    // leaveRoom is best-effort: it clears local state regardless of the failed emit.
    expect(useRoomStore.getState().code).toBeNull();
    expect(usePeersStore.getState().selfId).toBeNull();
  });

  it('keeps waiting through a failed attempt instead of rejecting immediately', async () => {
    // A free-tier host that has spun down fails the first handshake or two while
    // it boots; socket.io retries, so connect() must not bail on connect_error.
    const slow = new SignalingClient();
    const pending = slow.connect('http://test');
    mockSocket.__fire('connect_error', new Error('xhr poll error'));
    await expect(pending).resolves.toBeUndefined();
  });
});

describe('getSignalingUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses an explicit URL as-is', () => {
    vi.stubEnv('VITE_SIGNALING_URL', 'https://signaling.example.com');
    expect(getSignalingUrl()).toBe('https://signaling.example.com');
  });

  it('upgrades a bare host (Render Blueprint fromService) to https', () => {
    vi.stubEnv('VITE_SIGNALING_URL', 'dropzone-signaling.onrender.com');
    expect(getSignalingUrl()).toBe('https://dropzone-signaling.onrender.com');
  });

  it('falls back to localhost when nothing is configured', () => {
    vi.stubEnv('VITE_SIGNALING_URL', '');
    expect(getSignalingUrl()).toBe('http://localhost:3001');
  });
});
