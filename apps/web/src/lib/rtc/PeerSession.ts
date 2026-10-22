import {
  ControlMessageSchema,
  decodeFrame,
  type ControlMessage,
  type HelloMessage,
  DEFAULT_CHUNK_SIZE,
  BUFFER_LOW,
} from '@dropzone/protocol';
import type { IceServerEntry } from '../../state/roomStore.js';
import {
  classifyCandidateTypes,
  extractDetailedLinkReport,
  type ConnectionClass,
} from './stats.js';
import { supportsFsAccess, supportsOpfs } from '../transfer/capability.js';
import { computeSas } from './sas.js';

const STATS_POLL_INTERVAL_MS = 1000;

/** Peer connection lifecycle (FR-05). */
export type PeerState = 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

/** Negotiated data channel ids (TRD §7). */
export const CONTROL_CHANNEL_ID = 0;
export const FIRST_DATA_CHANNEL_ID = 1;

const ICE_RECONNECT_DELAY_MS = 3000;
const ICE_MAX_RECONNECT_ATTEMPTS = 5;
const PING_INTERVAL_MS = 5000;
const PONG_TIMEOUT_MS = 15000;

/** App-level RTT and transport diagnostics surfaced to the diagnostics UI (FR-31, FR-32, FR-33). */
export interface PeerLinkStats {
  rttMs: number | null;
  lastSeenAt: number | null;
  /** 'direct' (local or internet) vs 'relayed' (TURN); null until a pair is selected. */
  connectionClass: ConnectionClass | null;
  sas?: string | null;
  localCandidateType?: string | null;
  remoteCandidateType?: string | null;
  protocol?: string | null;
  availableOutgoingBitrate?: number | null;
  bufferedAmount?: number;
}

interface PeerSessionOptions {
  deviceId: string;
  name: string;
  polite: boolean;
  iceServers: IceServerEntry[];
  forceRelay?: boolean;
  channels?: number;
  maxMessageSize?: number;
  sendSignal: (kind: 'description' | 'candidate', data: unknown) => void;
  onStateChange: (state: PeerState) => void;
  /** Fires when the control channel opens and is ready for data exchange. */
  onReady?: () => void;
  /** Hello from the remote peer (name, caps). */
  onHello?: (hello: Omit<HelloMessage, 't' | 'v'>) => void;
  /** App-level text over the control channel (FR-31 round trip). */
  onText?: (text: string) => void;
  /** Transfer control messages (offer/accept/ack/…); consumed by TransferHub. */
  onControl?: (message: ControlMessage) => void;
  /** Binary chunk frames from the data channels (TRD §9). */
  onChunk?: (transferId: number, chunkIndex: number, payload: Uint8Array) => void;
  onStats?: (stats: PeerLinkStats) => void;
  onError?: (error: Error) => void;
  /** Injectable for tests; defaults to the real RTCDataChannel. */
  createPeerConnection?: (config: RTCConfiguration) => RTCPeerConnection;
}

/**
 * One RTCPeerConnection per peer pair with perfect negotiation (TRD §7).
 *
 * Uses negotiated data channels (both sides create at PC construction, so there
 * is no `ondatachannel` race): control on id 0 for JSON, data channels on id
 * 1..N for binary chunks (Phase 5).
 */
export class PeerSession {
  readonly remoteDeviceId: string;
  private readonly opts: PeerSessionOptions;
  private pc: RTCPeerConnection | null = null;
  private control: RTCDataChannel | null = null;
  private dataChannels: RTCDataChannel[] = [];
  private lowWaiters = new Map<number, Array<() => void>>();
  private remoteMaxMessageSize: number | null = null;
  private makingOffer = false;
  private ignoreOffer = false;
  private pendingCandidates: Array<RTCIceCandidateInit | null> = [];
  private state: PeerState = 'connecting';
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private statsTimer: number | null = null;
  private lastPongAt: number | null = null;
  private destroyed = false;
  private stats: PeerLinkStats = { rttMs: null, lastSeenAt: null, connectionClass: null };

  constructor(remoteDeviceId: string, opts: PeerSessionOptions) {
    this.remoteDeviceId = remoteDeviceId;
    this.opts = opts;
  }

  /** Build the PC, wire perfect negotiation, and create the negotiated channels. */
  start(): void {
    if (this.pc || this.destroyed) return;
    const createPc = this.opts.createPeerConnection ?? ((config: RTCConfiguration) => new RTCPeerConnection(config));
    const pc = createPc({
      iceServers: this.opts.iceServers as RTCIceServer[],
      iceTransportPolicy: this.opts.forceRelay ? 'relay' : 'all',
    });
    this.pc = pc;

    pc.onnegotiationneeded = async (): Promise<void> => {
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) {
          this.opts.sendSignal('description', { sdp: pc.localDescription.sdp, type: pc.localDescription.type });
          this.checkSas();
        }
      } catch (err) {
        this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        this.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }): void => {
      if (candidate) this.opts.sendSignal('candidate', { candidate: candidate.toJSON() });
    };

    pc.onconnectionstatechange = (): void => {
      switch (pc.connectionState) {
        case 'connected':
          this.reconnectAttempts = 0;
          this.setState('connected');
          this.startPingLoop();
          void this.classifyConnection();
          this.startStatsLoop();
          break;
        case 'disconnected':
          this.setState('disconnected');
          this.scheduleReconnect();
          break;
        case 'failed':
          this.setState('failed');
          this.restartIce();
          break;
        case 'closed':
          this.setState('closed');
          break;
        default:
          break;
      }
    };

    // Negotiated channels: created by BOTH sides, so no ondatachannel race.
    this.control = pc.createDataChannel('control', { negotiated: true, id: CONTROL_CHANNEL_ID, ordered: true });
    this.control.onmessage = (event): void => this.handleControlMessage(event.data);
    this.control.onopen = (): void => {
      this.sendHello();
      this.opts.onReady?.();
    };
    this.dataChannels = [];
    for (let i = 0; i < (this.opts.channels ?? 1); i++) {
      const channel = pc.createDataChannel(`data-${i}`, {
        negotiated: true,
        id: FIRST_DATA_CHANNEL_ID + i,
        ordered: false,
      });
      channel.binaryType = 'arraybuffer';
      channel.bufferedAmountLowThreshold = BUFFER_LOW;
      channel.onmessage = (event): void => this.handleDataMessage(event.data);
      channel.onbufferedamountlow = (): void => {
        const waiters = this.lowWaiters.get(i);
        if (waiters?.length) {
          this.lowWaiters.set(i, []);
          for (const resolve of waiters) resolve();
        }
      };
      this.dataChannels.push(channel);
    }
  }

  /** Send a binary frame on a data channel (TRD §9). */
  sendData(frame: ArrayBuffer, channelIndex = 0): boolean {
    const channel = this.dataChannels[channelIndex];
    if (!channel || channel.readyState !== 'open') return false;
    channel.send(frame);
    return true;
  }

  /** Current SCTP buffer depth for backpressure (TRD §10.1). */
  getBufferedAmount(channelIndex: number): number {
    return this.dataChannels[channelIndex]?.bufferedAmount ?? 0;
  }

  /** Resolves on the channel's next `bufferedamountlow` event. */
  whenBufferedAmountLow(channelIndex: number): Promise<void> {
    const channel = this.dataChannels[channelIndex];
    if (!channel || channel.bufferedAmount <= BUFFER_LOW) return Promise.resolve();
    return new Promise((resolve) => {
      const waiters = this.lowWaiters.get(channelIndex) ?? [];
      waiters.push(resolve);
      this.lowWaiters.set(channelIndex, waiters);
    });
  }

  dataChannelCount(): number {
    return this.dataChannels.length;
  }

  /** Remote SCTP message limit from hello (null until hello arrives). */
  getRemoteMaxMessageSize(): number | null {
    return this.remoteMaxMessageSize;
  }

  /** Feed a signaling `description` from the remote peer. */
  async receiveDescription(data: { sdp?: string; type?: 'offer' | 'answer' | 'pranswer' | 'rollback' }): Promise<void> {
    const pc = this.pc;
    if (!pc || this.destroyed) return;
    const description = data as RTCSessionDescriptionInit;
    const offerCollision = description.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');
    // Perfect negotiation: the impolite peer ignores colliding offers.
    this.ignoreOffer = !this.opts.polite && offerCollision;
    if (this.ignoreOffer) return;
    try {
      await pc.setRemoteDescription(description);
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        if (pc.localDescription) {
          this.opts.sendSignal('description', { sdp: pc.localDescription.sdp, type: pc.localDescription.type });
        }
      }
      this.checkSas();

      // Drain candidates queued while awaiting remote description
      if (this.pendingCandidates.length > 0) {
        const queued = [...this.pendingCandidates];
        this.pendingCandidates = [];
        for (const cand of queued) {
          try {
            await pc.addIceCandidate(cand);
          } catch {
            // Ignore stale queued candidate errors
          }
        }
      }
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /** Feed a signaling ICE candidate from the remote peer. */
  async receiveCandidate(data: { candidate?: unknown }): Promise<void> {
    const pc = this.pc;
    if (!pc || this.destroyed) return;
    const candidate = (data.candidate ?? null) as RTCIceCandidateInit | null;
    try {
      // A null candidate signals end-of-candidates; ignoreOffer drops stale ones.
      await pc.addIceCandidate(candidate);
    } catch (err) {
      if (!pc.remoteDescription) {
        this.pendingCandidates.push(candidate);
      } else if (!this.ignoreOffer) {
        this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /** Send a control-channel message (JSON, zod-validated on the receiving side). */
  sendControl(message: ControlMessage): boolean {
    if (!this.control) return false;
    if (this.control.readyState === 'connecting') {
      // If channel is still opening, queue message to send immediately once open
      const ctrl = this.control;
      const sendOnceOpen = () => {
        try {
          ctrl.send(JSON.stringify(message));
        } catch {
          // ignore send error
        }
        ctrl.removeEventListener('open', sendOnceOpen);
      };
      ctrl.addEventListener('open', sendOnceOpen);
      return true;
    }
    if (this.control.readyState !== 'open') return false;
    try {
      this.control.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  /** FR-05 text round trip over the control channel. */
  sendText(text: string): boolean {
    return this.sendControl({ t: 'text', id: crypto.randomUUID(), text });
  }

  getStats(): PeerLinkStats {
    return { ...this.stats };
  }

  /** Read the selected candidate pair and refine direct/relayed (TRD §10.1, FR-30, FR-31). */
  private async classifyConnection(): Promise<void> {
    const pc = this.pc;
    if (!pc || this.destroyed) return;
    try {
      const report = await pc.getStats();
      const map = new Map<string, RTCStats>();
      report.forEach((stat) => map.set(stat.id, stat));
      const detailed = extractDetailedLinkReport(map);
      if (!detailed) return;
      const connectionClass = classifyCandidateTypes(detailed.localType, detailed.remoteType);

      let bufferedAmount = 0;
      if (this.control && this.control.readyState === 'open') {
        bufferedAmount += this.control.bufferedAmount;
      }
      for (const dc of this.dataChannels) {
        if (dc.readyState === 'open') {
          bufferedAmount += dc.bufferedAmount;
        }
      }

      this.stats = {
        ...this.stats,
        connectionClass,
        localCandidateType: detailed.localType,
        remoteCandidateType: detailed.remoteType,
        protocol: detailed.protocol,
        availableOutgoingBitrate: detailed.availableOutgoingBitrate,
        bufferedAmount,
        rttMs: detailed.currentRoundTripTimeMs ?? this.stats.rttMs,
      };
      this.opts.onStats?.(this.getStats());
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async checkSas(): Promise<void> {
    const pc = this.pc;
    if (!pc || !pc.localDescription?.sdp || !pc.remoteDescription?.sdp) return;
    try {
      const sas = await computeSas(pc.localDescription.sdp, pc.remoteDescription.sdp);
      if (sas && this.stats.sas !== sas) {
        this.stats = { ...this.stats, sas };
        this.opts.onStats?.(this.getStats());
      }
    } catch {
      // SAS generation failure should not disrupt the connection
    }
  }

  private startStatsLoop(): void {
    if (this.statsTimer !== null || this.destroyed) return;
    this.statsTimer = window.setInterval(() => {
      void this.classifyConnection();
    }, STATS_POLL_INTERVAL_MS);
  }

  private stopStatsLoop(): void {
    if (this.statsTimer !== null) {
      window.clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  getState(): PeerState {
    return this.state;
  }

  /** Tear down PC, channels, and timers. Idempotent. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopPingLoop();
    this.stopStatsLoop();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.control?.close();
    } catch {
      // channel may already be closed
    }
    try {
      this.pc?.close();
    } catch {
      // pc may already be closed
    }
    for (const resolve of this.lowWaiters.values()) for (const fn of resolve) fn();
    this.lowWaiters.clear();
    this.pendingCandidates = [];
    this.control = null;
    this.dataChannels = [];
    this.pc = null;
    this.setState('closed');
  }

  private setState(state: PeerState): void {
    if (this.state === state) return;
    this.state = state;
    this.opts.onStateChange(state);
  }

  private sendHello(): void {
    this.sendControl({
      t: 'hello',
      v: 1,
      deviceId: this.opts.deviceId,
      name: this.opts.name,
      caps: {
        maxMessageSize: this.opts.maxMessageSize ?? 65536,
        fsAccess: supportsFsAccess(),
        opfs: supportsOpfs(),
        channels: this.opts.channels ?? 1,
      },
    });
  }

  private handleControlMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const result = ControlMessageSchema.safeParse(parsed);
    if (!result.success) return;
    const message = result.data;
    switch (message.t) {
      case 'hello':
        this.remoteMaxMessageSize = message.caps.maxMessageSize;
        this.opts.onHello?.({ deviceId: message.deviceId, name: message.name, caps: message.caps });
        break;
      case 'ping':
        this.sendControl({ t: 'pong', ts: message.ts });
        break;
      case 'pong': {
        const rtt = Date.now() - message.ts;
        this.lastPongAt = Date.now();
        this.stats = { ...this.stats, rttMs: rtt, lastSeenAt: this.lastPongAt };
        this.opts.onStats?.(this.getStats());
        break;
      }
      case 'text':
        this.opts.onText?.(message.text);
        break;
      default:
        // Transfer messages (offer/accept/ack/…) go to the transfer engine.
        this.opts.onControl?.(message);
        break;
    }
  }

  private handleDataMessage(raw: unknown): void {
    if (!(raw instanceof ArrayBuffer)) return;
    try {
      const frame = decodeFrame(raw);
      this.opts.onChunk?.(frame.transferId, frame.chunkIndex, frame.payload);
    } catch {
      // Malformed frames are dropped (TRD §9: parser must never crash).
    }
  }

  private startPingLoop(): void {
    if (this.pingTimer !== null || this.destroyed) return;
    this.pingTimer = window.setInterval(() => {
      if (this.lastPongAt !== null && Date.now() - this.lastPongAt > PONG_TIMEOUT_MS) {
        this.setState('disconnected');
        this.restartIce();
        return;
      }
      this.sendControl({ t: 'ping', ts: Date.now() });
    }, PING_INTERVAL_MS);
    this.sendControl({ t: 'ping', ts: Date.now() });
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.destroyed) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.state === 'disconnected') this.restartIce();
    }, ICE_RECONNECT_DELAY_MS);
  }

  private restartIce(): void {
    if (this.destroyed) return;
    if (this.reconnectAttempts >= ICE_MAX_RECONNECT_ATTEMPTS) {
      this.setState('failed');
      return;
    }
    this.reconnectAttempts++;
    try {
      this.pc?.restartIce();
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

export type { PeerSessionOptions };
export { DEFAULT_CHUNK_SIZE };
