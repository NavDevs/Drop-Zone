import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PeerSession } from '../lib/rtc/PeerSession.js';
import type { PeerSessionOptions } from '../lib/rtc/PeerSession.js';

const DEVICE_A = '11111111-1111-4111-8111-111111111111';
const DEVICE_B = '22222222-2222-4222-8222-222222222222';

class FakeDataChannel {
  readyState: RTCDataChannelState = 'open';
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 'closed';
  }

  emit(data: unknown): void {
    this.onmessage?.({ data });
  }
}

class FakePeerConnection {
  onnegotiationneeded: (() => void | Promise<void>) | null = null;
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  signalingState: RTCSignalingState = 'stable';
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  channels: FakeDataChannel[] = [];
  restartIceCalls = 0;

  createDataChannel(_label: string, _init?: RTCDataChannelInit): RTCDataChannel {
    const channel = new FakeDataChannel();
    this.channels.push(channel);
    return channel as unknown as RTCDataChannel;
  }

  addIceCandidate = vi.fn(async (_c: unknown) => {});

  async setLocalDescription(desc?: RTCSessionDescriptionInit): Promise<void> {
    if (desc) {
      this.localDescription = desc as RTCSessionDescription;
      return;
    }
    if (!this.remoteDescription || this.remoteDescription.type !== 'offer') {
      throw new Error('InvalidStateError: no remote offer to answer');
    }
    this.localDescription = { type: 'answer', sdp: 'fake-answer-sdp' } as RTCSessionDescription;
  }

  setRemoteDescription = vi.fn(async (desc: RTCSessionDescriptionInit): Promise<void> => {
    this.remoteDescription = desc as RTCSessionDescription;
  });

  restartIce(): void {
    this.restartIceCalls += 1;
  }

  close(): void {
    this.connectionState = 'closed';
  }

  setConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }

  control(): FakeDataChannel {
    return this.channels[0]!;
  }
}

interface Harness {
  session: PeerSession;
  pc: FakePeerConnection;
  sendSignal: ReturnType<typeof vi.fn>;
  onStateChange: ReturnType<typeof vi.fn>;
  onHello: ReturnType<typeof vi.fn>;
  onText: ReturnType<typeof vi.fn>;
  onStats: ReturnType<typeof vi.fn>;
}

function harness(overrides: Partial<PeerSessionOptions> = {}): Harness {
  const pc = new FakePeerConnection();
  const sendSignal = vi.fn();
  const onStateChange = vi.fn();
  const onHello = vi.fn();
  const onText = vi.fn();
  const onStats = vi.fn();

  const session = new PeerSession(DEVICE_B, {
    deviceId: DEVICE_A,
    name: 'Test Device',
    polite: true,
    iceServers: [],
    sendSignal: sendSignal as PeerSessionOptions['sendSignal'],
    onStateChange,
    onHello,
    onText,
    onStats,
    createPeerConnection: () => pc as unknown as RTCPeerConnection,
    ...overrides,
  });

  return { session, pc, sendSignal, onStateChange, onHello, onText, onStats };
}

describe('PeerSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('creates negotiated control + data channels on start', () => {
    const { session, pc } = harness();
    session.start();

    expect(pc.channels.length).toBe(2);
    expect(pc.channels[0]).toBeInstanceOf(FakeDataChannel);
  });

  it('sends hello once the control channel opens', async () => {
    const { session, pc } = harness();
    session.start();
    pc.control().onopen?.();

    const hello = JSON.parse(pc.control().sent[0]!);
    expect(hello).toMatchObject({ t: 'hello', deviceId: DEVICE_A, name: 'Test Device' });
  });

  it('answers ping with pong using the echoed timestamp', async () => {
    const { session, pc } = harness();
    session.start();

    pc.control().emit(JSON.stringify({ t: 'ping', ts: 1234 }));
    await Promise.resolve();

    const pong = pc.control().sent.map((s) => JSON.parse(s)).find((m) => m.t === 'pong');
    expect(pong).toEqual({ t: 'pong', ts: 1234 });
  });

  it('records RTT on pong and notifies onStats', async () => {
    const { session, pc, onStats } = harness();
    session.start();

    vi.setSystemTime(10_000);
    pc.control().emit(JSON.stringify({ t: 'pong', ts: 9_500 }));
    await Promise.resolve();

    expect(session.getStats().rttMs).toBe(500);
    expect(onStats).toHaveBeenCalled();
  });

  it('forwards received text to onText', () => {
    const { session, pc, onText } = harness();
    session.start();

    pc.control().emit(JSON.stringify({ t: 'text', id: 'x', text: 'hello there' }));
    expect(onText).toHaveBeenCalledWith('hello there');
  });

  it('answers a remote offer by setting the answer as the local description', async () => {
    const { session, pc, sendSignal } = harness();
    session.start();

    await session.receiveDescription({ type: 'offer', sdp: 'remote-offer-sdp' });

    expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'remote-offer-sdp' });
    expect(pc.localDescription?.type).toBe('answer');
    expect(sendSignal).toHaveBeenCalledWith('description', {
      type: 'answer',
      sdp: 'fake-answer-sdp',
    });
  });

  it('applies a remote answer without generating a new offer', async () => {
    const { session, pc, sendSignal } = harness();
    session.start();
    sendSignal.mockClear();

    await session.receiveDescription({ type: 'answer', sdp: 'remote-answer-sdp' });

    expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'remote-answer-sdp' });
    expect(pc.localDescription).toBeNull();
    expect(sendSignal).not.toHaveBeenCalled();
  });

  it('adds relayed ICE candidates to the peer connection', async () => {
    const { session, pc } = harness();
    session.start();
    const candidate = { candidate: 'candidate:1 1 udp 1 127.0.0.1 5000 typ host' };

    await session.receiveCandidate({ candidate });

    expect(pc.addIceCandidate).toHaveBeenCalledWith(candidate);
  });

  it('emits connected on the data channel open path via connectionState', () => {
    const { session, pc, onStateChange } = harness();
    session.start();

    pc.setConnectionState('connected');
    expect(onStateChange).toHaveBeenCalledWith('connected');
    expect(session.getState()).toBe('connected');
  });

  it('marks failed after exceeding ICE reconnect attempts', () => {
    const { session, pc } = harness();
    session.start();

    for (let i = 0; i < 6; i++) {
      pc.setConnectionState('failed');
    }
    expect(session.getState()).toBe('failed');
  });

  it('is idempotent on destroy', () => {
    const { session } = harness();
    session.start();
    session.destroy();
    session.destroy();
    expect(session.getState()).toBe('closed');
  });
});
