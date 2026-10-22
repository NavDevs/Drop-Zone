import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PeerManager } from '../lib/rtc/PeerManager.js';
import { usePeersStore } from '../state/peersStore.js';

const REMOTE = '22222222-2222-4222-8222-222222222222';

/** Control/data channel with a manually-driven open transition. */
class FakeRTCDataChannel {
  readyState: RTCDataChannelState = 'connecting';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onbufferedamountlow: (() => void) | null = null;
  binaryType = 'blob';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  sent: string[] = [];

  send(data: unknown): void {
    this.sent.push(String(data));
  }

  close(): void {
    this.readyState = 'closed';
  }

  addEventListener = vi.fn();
  removeEventListener = vi.fn();

  /** Simulate the transport finishing the channel handshake. */
  open(): void {
    this.readyState = 'open';
    this.onopen?.();
  }
}

class FakeRTCPeerConnection {
  static instances: FakeRTCPeerConnection[] = [];

  channels: FakeRTCDataChannel[] = [];
  onnegotiationneeded: (() => void) | null = null;
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  restartIceCalls = 0;

  constructor() {
    FakeRTCPeerConnection.instances.push(this);
  }

  createDataChannel(): RTCDataChannel {
    const channel = new FakeRTCDataChannel();
    this.channels.push(channel);
    return channel as unknown as RTCDataChannel;
  }

  close(): void {
    this.connectionState = 'closed';
  }

  restartIce(): void {
    this.restartIceCalls += 1;
  }

  async setLocalDescription(): Promise<void> {}
  async setRemoteDescription(): Promise<void> {}
  async addIceCandidate(): Promise<void> {}
  async getStats(): Promise<RTCStatsReport> {
    return { forEach: () => {} } as unknown as RTCStatsReport;
  }
}

const REAL_PC = (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection;

describe('PeerManager readiness', () => {
  beforeEach(() => {
    FakeRTCPeerConnection.instances = [];
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = FakeRTCPeerConnection;
  });

  afterEach(() => {
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = REAL_PC;
    usePeersStore.getState().reset();
    vi.useRealTimers();
  });

  it('reports not ready when no session exists', () => {
    const manager = new PeerManager();
    expect(manager.isReady(REMOTE)).toBe(false);
  });

  it('is not ready while the control channel is still connecting', () => {
    const manager = new PeerManager();
    manager.ensureSession(REMOTE);
    expect(manager.isReady(REMOTE)).toBe(false);
  });

  it('waitForReady resolves true once the control channel opens', async () => {
    const manager = new PeerManager();
    manager.ensureSession(REMOTE);
    const pc = FakeRTCPeerConnection.instances.at(-1)!;

    const promise = manager.waitForReady(REMOTE, 5000);
    pc.channels[0]!.open();

    await expect(promise).resolves.toBe(true);
    expect(manager.isReady(REMOTE)).toBe(true);
  });

  it('waitForReady resolves false when the channel never opens', async () => {
    vi.useFakeTimers();
    const manager = new PeerManager();
    manager.ensureSession(REMOTE);

    const promise = manager.waitForReady(REMOTE, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toBe(false);
  });

  it('waitForReady resolves immediately when the peer is already ready', async () => {
    const manager = new PeerManager();
    manager.ensureSession(REMOTE);
    FakeRTCPeerConnection.instances.at(-1)!.channels[0]!.open();

    await expect(manager.waitForReady(REMOTE, 5000)).resolves.toBe(true);
  });

  it('resumeAll creates a session for a room peer that has none', () => {
    const manager = new PeerManager();
    usePeersStore.getState().upsertPeer({ deviceId: REMOTE, name: 'Phone', type: 'phone' });

    manager.resumeAll();

    expect(FakeRTCPeerConnection.instances).toHaveLength(1);
  });

  it('resumeAll nudges a not-ready session to renegotiate', () => {
    const manager = new PeerManager();
    usePeersStore.getState().upsertPeer({ deviceId: REMOTE, name: 'Phone', type: 'phone' });
    manager.ensureSession(REMOTE);
    const pc = FakeRTCPeerConnection.instances.at(-1)!;

    manager.resumeAll();

    expect(pc.restartIceCalls).toBe(1);
  });

  it('resumeAll leaves an already-ready session untouched', () => {
    const manager = new PeerManager();
    usePeersStore.getState().upsertPeer({ deviceId: REMOTE, name: 'Phone', type: 'phone' });
    manager.ensureSession(REMOTE);
    const pc = FakeRTCPeerConnection.instances.at(-1)!;
    pc.channels[0]!.open();

    manager.resumeAll();

    expect(pc.restartIceCalls).toBe(0);
  });
});
