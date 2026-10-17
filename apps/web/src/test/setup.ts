import '@testing-library/jest-dom/vitest';

// jsdom has no WebRTC; a minimal no-op stub lets SignalingClient/PeerManager
// create sessions in unit tests without touching a real RTCPeerConnection.
class NoopRTCPeerConnection {
  createDataChannel(): RTCDataChannel {
    return { readyState: 'open', send: () => {}, close: () => {} } as unknown as RTCDataChannel;
  }
  close(): void {}
  restartIce(): void {}
  async setLocalDescription(): Promise<void> {}
  async setRemoteDescription(): Promise<void> {}
  async addIceCandidate(): Promise<void> {}
}
(globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection ??= NoopRTCPeerConnection;
