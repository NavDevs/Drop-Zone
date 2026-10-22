import type { RelayedSignalPayload, ControlMessage } from '@dropzone/protocol';
import { usePeersStore } from '../../state/peersStore.js';
import { useRoomStore } from '../../state/roomStore.js';
import { getDeviceId, getDeviceName } from '../device.js';
import type { TransferTransport } from '../transfer/transport.js';
import { PeerSession, type PeerState, type PeerLinkStats } from './PeerSession.js';

/** Force TURN relay for all connections (TRD §7 debug flag for relay testing). */
export function isForceRelayEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('forceRelay') === '1'
      || localStorage.getItem('dz:forceRelay') === '1';
  } catch {
    return false;
  }
}

/**
 * Owns the PeerSession map for the current room (TRD §7).
 *
 * Presence comes from signaling; WebRTC is created lazily when a peer joins.
 * Polite peer = larger deviceId, so both sides agree without extra signaling.
 */
export class PeerManager {
  private sessions = new Map<string, PeerSession>();
  private sendSignal: ((to: string, kind: 'description' | 'candidate', data: unknown) => void) | null = null;
  private textListeners = new Set<(deviceId: string, text: string) => void>();
  private rttListeners = new Set<(deviceId: string, rtt: number | null) => void>();
  private statsListeners = new Set<(deviceId: string, stats: PeerLinkStats) => void>();
  private controlListeners = new Set<(deviceId: string, message: ControlMessage) => void>();
  private chunkListeners = new Set<(deviceId: string, transferId: number, chunkIndex: number, payload: Uint8Array) => void>();
  private sessionRemovedListeners = new Set<(deviceId: string) => void>();
  private readyListeners = new Set<(deviceId: string) => void>();

  /** Wire the outbound signal sender; call once when a room is joined. */
  start(sendSignal: (to: string, kind: 'description' | 'candidate', data: unknown) => void): void {
    this.sendSignal = sendSignal;
  }

  /** Route an inbound relayed signal to the right session, creating one if needed. */
  async handleSignal(payload: RelayedSignalPayload): Promise<void> {
    let session = this.sessions.get(payload.from);
    if (!session) {
      session = this.createSession(payload.from);
      session.start();
    }
    if (payload.kind === 'description') {
      await session.receiveDescription(payload.data as { sdp?: string; type?: 'offer' | 'answer' });
    } else {
      await session.receiveCandidate(payload.data as { candidate?: unknown });
    }
  }

  /** Ensure a session exists for a peer that just joined (lazy PC per TRD §7). */
  ensureSession(remoteDeviceId: string): PeerSession {
    let session = this.sessions.get(remoteDeviceId);
    if (!session) {
      session = this.createSession(remoteDeviceId);
      session.start();
    }
    return session;
  }

  /** FR-05 text round trip over the control channel. Returns false if not connected. */
  sendText(remoteDeviceId: string, text: string): boolean {
    const session = this.sessions.get(remoteDeviceId);
    return session ? session.sendText(text) : false;
  }

  getLinkStats(remoteDeviceId: string): PeerLinkStats | null {
    const session = this.sessions.get(remoteDeviceId);
    return session ? session.getStats() : null;
  }

  onText(listener: (deviceId: string, text: string) => void): () => void {
    this.textListeners.add(listener);
    return () => this.textListeners.delete(listener);
  }

  subscribeText(listener: (deviceId: string, text: string) => void): () => void {
    return this.onText(listener);
  }

  subscribeRtt(listener: (deviceId: string, rtt: number | null) => void): () => void {
    this.rttListeners.add(listener);
    return () => this.rttListeners.delete(listener);
  }

  /** Full link stats (RTT + FR-30 class) for the diagnostics UI. */
  subscribeStats(listener: (deviceId: string, stats: PeerLinkStats) => void): () => void {
    this.statsListeners.add(listener);
    return () => this.statsListeners.delete(listener);
  }

  /** Transfer control messages (offer/accept/…) from any session. */
  subscribeControl(listener: (deviceId: string, message: ControlMessage) => void): () => void {
    this.controlListeners.add(listener);
    return () => this.controlListeners.delete(listener);
  }

  /** Binary chunk frames from any session. */
  subscribeChunk(
    listener: (deviceId: string, transferId: number, chunkIndex: number, payload: Uint8Array) => void,
  ): () => void {
    this.chunkListeners.add(listener);
    return () => this.chunkListeners.delete(listener);
  }

  /** Fires when a peer's session is torn down (peer left / room closed). */
  subscribeSessionRemoved(listener: (deviceId: string) => void): () => void {
    this.sessionRemovedListeners.add(listener);
    return () => this.sessionRemovedListeners.delete(listener);
  }

  /** Fires when a peer's control channel opens and is ready for data exchange. */
  subscribeReady(listener: (deviceId: string) => void): () => void {
    this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }

  /** Transfer-engine transport for a peer; null if no session exists. */
  getTransport(deviceId: string): TransferTransport | null {
    const session = this.sessions.get(deviceId);
    if (!session) return null;
    return {
      sendControl: (message) => session.sendControl(message),
      sendData: (frame, channelIndex) => session.sendData(frame, channelIndex),
      getBufferedAmount: (channelIndex) => session.getBufferedAmount(channelIndex),
      whenBufferedAmountLow: (channelIndex) => session.whenBufferedAmountLow(channelIndex),
      dataChannelCount: () => session.dataChannelCount(),
      getRemoteMaxMessageSize: () => session.getRemoteMaxMessageSize(),
    };
  }

  /** Drop a peer's session (peer left or room closed). */
  removeSession(remoteDeviceId: string): void {
    const session = this.sessions.get(remoteDeviceId);
    if (session) {
      session.destroy();
      this.sessions.delete(remoteDeviceId);
      for (const listener of this.sessionRemovedListeners) listener(remoteDeviceId);
    }
    usePeersStore.getState().setPresence(remoteDeviceId, 'offline');
  }

  destroyAll(): void {
    const removedIds = [...this.sessions.keys()];
    for (const [id, session] of this.sessions) {
      session.destroy();
      usePeersStore.getState().setPresence(id, 'offline');
    }
    this.sessions.clear();
    for (const id of removedIds) {
      for (const listener of this.sessionRemovedListeners) listener(id);
    }
    this.textListeners.clear();
    this.rttListeners.clear();
    this.statsListeners.clear();
    // Keep transfer engine listeners (controlListeners, chunkListeners, sessionRemovedListeners)
    // and sendSignal across room unmounts: they are module/singleton-scoped and clearing them
    // breaks transfers under React StrictMode double-mounts.
  }

  private createSession(remoteDeviceId: string): PeerSession {
    const selfId = getDeviceId();
    // Perfect negotiation (TRD §7): polite peer = larger deviceId.
    const polite = selfId > remoteDeviceId;
    const forceRelay = isForceRelayEnabled();
    const { iceServers } = useRoomStore.getState();

    const session = new PeerSession(remoteDeviceId, {
      deviceId: selfId,
      name: getDeviceName(),
      polite,
      iceServers,
      forceRelay,
      sendSignal: (kind, data) => this.sendSignal?.(remoteDeviceId, kind, data),
      onReady: () => {
        for (const listener of this.readyListeners) listener(remoteDeviceId);
      },
      onStateChange: (state: PeerState) => {
        usePeersStore.getState().setPresence(remoteDeviceId, mapStateToPresence(state));
      },
      onStats: (stats) => {
        if (stats.connectionClass) {
          // FR-05 presence is coarse (direct/relayed); FR-30 detail rides on stats.
          const presence = stats.connectionClass === 'relayed' ? 'relayed' as const : 'direct' as const;
          usePeersStore.getState().setPresence(remoteDeviceId, presence);
        }
        for (const listener of this.rttListeners) listener(remoteDeviceId, stats.rttMs);
        for (const listener of this.statsListeners) listener(remoteDeviceId, stats);
      },
      onText: (text) => {
        for (const listener of this.textListeners) listener(remoteDeviceId, text);
      },
      onControl: (message) => {
        for (const listener of this.controlListeners) listener(remoteDeviceId, message);
      },
      onChunk: (transferId, chunkIndex, payload) => {
        for (const listener of this.chunkListeners) listener(remoteDeviceId, transferId, chunkIndex, payload);
      },
      onError: (error) => {
        // Surface negotiation/ICE failures; silent errors make e2e hangs undebuggable.
        console.error(`[PeerSession ${remoteDeviceId}]`, error);
      },
    });
    this.sessions.set(remoteDeviceId, session);
    return session;
  }
}

/** Map a PeerState to the peersStore presence value (FR-05). */
function mapStateToPresence(state: PeerState): 'connecting' | 'direct' | 'relayed' | 'offline' {
  switch (state) {
    case 'connecting':
      return 'connecting';
    case 'connected':
      // Direct/relayed is refined from getStats() once ICE selects a pair.
      return 'direct';
    case 'disconnected':
    case 'failed':
    case 'closed':
      return 'offline';
  }
}

let manager: PeerManager | null = null;

export function getPeerManager(): PeerManager {
  if (!manager) manager = new PeerManager();
  return manager;
}
