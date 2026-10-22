import { io, type Socket } from 'socket.io-client';
import type {
  DeviceInfo,
  RoomCreateAck,
  RoomCreatePayload,
  RoomJoinAck,
  RoomJoinPayload,
  RoomRegenerateAck,
  RelayedSignalPayload,
} from '@dropzone/protocol';
import { buildDeviceInfo } from '../device.js';
import { useRoomStore, type IceServerEntry } from '../../state/roomStore.js';
import { usePeersStore } from '../../state/peersStore.js';
import { friendlyError, roomClosedReason } from '../errors.js';
import { getPeerManager } from '../rtc/PeerManager.js';
import {
  unwrapAck,
  type AckEnvelope,
  type AckResult,
  type SignalingClientEvents,
  type SignalingServerEvents,
} from './events.js';

type ServerSocket = Socket<SignalingServerEvents, SignalingClientEvents>;
type SignalListener = (payload: RelayedSignalPayload) => void;
type PayloadOf<E extends keyof SignalingClientEvents> = Parameters<SignalingClientEvents[E]>[0];

function getSignalingUrl(): string {
  if (import.meta.env.VITE_SIGNALING_URL) {
    return import.meta.env.VITE_SIGNALING_URL;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return 'http://localhost:3001';
}

const SIGNALING_URL = getSignalingUrl();
const ACK_TIMEOUT_MS = 5000;
const CONNECT_TIMEOUT_MS = 8000;

/**
 * Socket.IO signaling client: typed ack wrappers, backoff reconnection,
 * auto-rejoin of the stored room, and dispatch of server events into stores.
 */
export class SignalingClient {
  private socket: ServerSocket | null = null;
  private everConnected = false;
  private serverBoundCode: string | null = null;
  private inflight: { key: string; promise: Promise<AckResult<unknown>> } | null = null;
  private connectPromise: Promise<void> | null = null;
  private readonly signalListeners = new Set<SignalListener>();
  private peerManager = getPeerManager();

  /** Awaitable connect: resolves once the socket is connected, rejects on timeout. Idempotent. */
  connect(url: string = SIGNALING_URL): Promise<void> {
    if (this.connectPromise) {
      if (this.socket && !this.socket.connected) this.socket.connect();
      return this.connectPromise;
    }
    const socket: ServerSocket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 8000,
      randomizationFactor: 0.5,
      timeout: ACK_TIMEOUT_MS,
    });
    this.socket = socket;

    const attempt = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('NETWORK')), CONNECT_TIMEOUT_MS);
      socket.once('connect', () => {
        window.clearTimeout(timer);
        resolve();
      });
      socket.once('connect_error', () => {
        window.clearTimeout(timer);
        reject(new Error('NETWORK'));
      });
    });
    // Reset the cached promise on failure so a later call() can retry cleanly.
    this.connectPromise = attempt.catch((err: unknown): never => {
      this.connectPromise = null;
      throw err;
    });

    socket.on('connect', () => {
      useRoomStore.getState().setLink('connected');
      const wasConnected = this.everConnected;
      this.everConnected = true;
      if (wasConnected) {
        void this.rejoinAfterReconnect();
      }
    });
    socket.on('disconnect', () => {
      this.serverBoundCode = null;
      useRoomStore.getState().setLink('reconnecting');
    });
    socket.io.on('reconnect_failed', () => {
      useRoomStore.getState().setError({ code: 'NETWORK', message: friendlyError('NETWORK') });
    });

    socket.on('peer:joined', (payload) => {
      const state = useRoomStore.getState();
      const selfId = usePeersStore.getState().selfId;
      if (payload.device.deviceId === selfId) {
        // approval granted (self peer:joined per DECISIONS 2026-10-17)
        if (state.status === 'pending') {
          useRoomStore.getState().setStatus('joined');
        }
      }
      usePeersStore.getState().upsertPeer(payload.device);
      this.peerManager.ensureSession(payload.device.deviceId);
    });
    socket.on('peer:left', (payload) => {
      usePeersStore.getState().removePeer(payload.deviceId);
      this.peerManager.removeSession(payload.deviceId);
    });
    socket.on('peer:updated', (payload) => {
      usePeersStore.getState().upsertPeer(payload.device);
    });
    socket.on('join:request', (payload) => {
      usePeersStore.getState().addPending(payload.device);
    });
    socket.on('room:closed', (payload) => {
      const message = roomClosedReason(payload.reason);
      this.peerManager.destroyAll();
      usePeersStore.getState().reset();
      useRoomStore.getState().clear();
      useRoomStore.getState().setError({ code: 'ROOM_CLOSED', message });
      this.serverBoundCode = null;
    });
    socket.on('room:codeChanged', (payload) => {
      useRoomStore.getState().setCode(payload.code, payload.codeExpiresAt);
    });
    socket.on('ice:refresh', (payload) => {
      useRoomStore.getState().setIceServers(payload.iceServers as IceServerEntry[]);
    });
    socket.on('signal', (payload) => {
      for (const listener of this.signalListeners) listener(payload);
      void this.peerManager.handleSignal(payload);
    });

    // Wire WebRTC outbound signaling once per socket. Doing this in
    // createRoom/joinRoom breaks under StrictMode: Room's cleanup runs
    // destroyAll() (which cleared the sender) before a later re-join could
    // re-arm it, leaving sessions unable to send offers silently.
    this.peerManager.start((to, kind, data) => {
      void this.sendSignal(to, kind, data);
    });

    return this.connectPromise;
  }

  disconnect(): void {
    this.socket?.disconnect();
  }

  /** Payload arg of a declared client event (acks are supplied by socket.io's timeout wrapper). */
  private emitAck<E extends keyof SignalingClientEvents>(event: E, payload: PayloadOf<E>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('NETWORK'));
        return;
      }
      // socket.io's .timeout() wraps the ack as error-first (err, res) — the event
      // map only declares (res). Cast emit to a loose signature (no any) to bridge.
      const ack = (err: Error | null, res?: unknown): void => {
        if (err) reject(new Error('TIMEOUT'));
        else resolve(res);
      };
      // Capture the timeout socket in a local and bind emit — calling
      // this.socket.timeout(...).emit in one expression loses `this` on the
      // bound socket, which throws `Cannot read properties of undefined (_opts)`.
      const timed = this.socket.timeout(ACK_TIMEOUT_MS);
      const emit = timed.emit.bind(timed) as (ev: string, ...args: unknown[]) => void;
      emit(event as string, payload, ack);
    });
  }

  /** emit → unwrap ack envelope → map transport failures to a NETWORK result. */
  private async callEvent<E extends keyof SignalingClientEvents, T>(event: E, payload: PayloadOf<E>): Promise<AckResult<T>> {
    try {
      const res = (await this.emitAck(event, payload)) as AckEnvelope<T>;
      return unwrapAck<T>(res);
    } catch {
      return this.networkError();
    }
  }

  private async call<T>(key: string, fn: () => Promise<AckResult<T>>): Promise<AckResult<T>> {
    if (this.inflight && this.inflight.key === key) {
      return this.inflight.promise as Promise<AckResult<T>>;
    }
    const promise = fn().finally(() => {
      if (this.inflight?.promise === promise) this.inflight = null;
    });
    this.inflight = { key, promise };
    return promise;
  }

  private networkError(): AckResult<never> {
    return { ok: false, code: 'NETWORK', message: friendlyError('NETWORK') };
  }

  private async leaveBestEffort(): Promise<void> {
    if (!this.serverBoundCode) return;
    try {
      await this.emitAck('room:leave', {});
    } catch {
      // socket is fresh after reconnect or server already dropped us
    }
    this.serverBoundCode = null;
    usePeersStore.getState().reset();
    useRoomStore.getState().clear();
  }

  createRoom(
    device: DeviceInfo,
    opts: { ttlSec?: RoomCreatePayload['ttlSec']; requireApproval?: boolean } = {},
  ): Promise<AckResult<RoomCreateAck>> {
    return this.call(`create:${device.deviceId}`, async () => {
      usePeersStore.getState().setSelfId(device.deviceId);
      const store = useRoomStore.getState();
      store.setStatus('creating');
      store.setError(null);
      try {
        await this.connect();
      } catch {
        store.setError({ code: 'NETWORK', message: friendlyError('NETWORK') });
        return this.networkError();
      }
      await this.leaveBestEffort();
      const payload: RoomCreatePayload = { device, ...opts };
      const res = await this.callEvent<'room:create', RoomCreateAck>('room:create', payload);
    if (res.ok) {
      this.serverBoundCode = res.data.code;
      store.setJoined({
        code: res.data.code,
        isHost: true,
        codeExpiresAt: res.data.codeExpiresAt,
        iceServers: res.data.iceServers as IceServerEntry[],
      });
      usePeersStore.getState().setAll([]);
    } else {
      store.setError({ code: res.code, message: friendlyError(res.code) });
    }
    return res;
    });
  }

  joinRoom(code: string, device: DeviceInfo = buildDeviceInfo()): Promise<AckResult<RoomJoinAck>> {
    return this.call(`join:${code}`, async () => {
      usePeersStore.getState().setSelfId(device.deviceId);
      const store = useRoomStore.getState();
      store.setStatus('joining');
      store.setError(null);
      try {
        await this.connect();
      } catch {
        store.setError({ code: 'NETWORK', message: friendlyError('NETWORK') });
        return this.networkError();
      }
      if (this.serverBoundCode && this.serverBoundCode !== code) {
        await this.leaveBestEffort();
      }
      const payload: RoomJoinPayload = { code, device };
      const res = await this.callEvent<'room:join', RoomJoinAck>('room:join', payload);
      if (res.ok) {
        if ('pending' in res.data) {
          this.serverBoundCode = code;
          store.setPending(code);
        } else {
          this.serverBoundCode = res.data.code;
          store.setJoined({
            code: res.data.code,
            isHost: false,
            codeExpiresAt: res.data.codeExpiresAt,
            iceServers: res.data.iceServers as IceServerEntry[],
          });
          usePeersStore.getState().setAll(
            res.data.peers.map((p) => ({ device: p.device, joinedAt: p.joinedAt, presence: 'online' as const })),
          );
          for (const p of res.data.peers) this.peerManager.ensureSession(p.device.deviceId);
        }
      } else {
        store.setError({ code: res.code, message: friendlyError(res.code) });
      }
      return res;
    });
  }

  private async rejoinAfterReconnect(): Promise<void> {
    const store = useRoomStore.getState();
    const code = store.code;
    if (!code || (store.status !== 'joined' && store.status !== 'pending')) return;
    // joinRoom sets isHost:false on success — host migrates on disconnect
    // (DECISIONS 2026-10-17), so a rejoining device never reclaims host.
    await this.joinRoom(code);
  }

  async leaveRoom(): Promise<void> {
    if (this.serverBoundCode) {
      await this.callEvent<'room:leave', Record<string, never>>('room:leave', {});
    }
    this.serverBoundCode = null;
    this.peerManager.destroyAll();
    usePeersStore.getState().reset();
    useRoomStore.getState().clear();
    useRoomStore.getState().setStatus('idle');
  }

  closeRoom(): Promise<AckResult<Record<string, never>>> {
    return this.call('close', async () => {
      const res = await this.callEvent<'room:close', Record<string, never>>('room:close', {});
      if (!res.ok) useRoomStore.getState().setError({ code: res.code, message: friendlyError(res.code) });
      return res;
    });
  }

  regenerateCode(): Promise<AckResult<RoomRegenerateAck>> {
    return this.call('regenerate', async () => {
      const res = await this.callEvent<'room:regenerate', RoomRegenerateAck>('room:regenerate', {});
      if (res.ok) {
        this.serverBoundCode = res.data.code;
        useRoomStore.getState().setCode(res.data.code, res.data.codeExpiresAt);
      } else {
        useRoomStore.getState().setError({ code: res.code, message: friendlyError(res.code) });
      }
      return res;
    });
  }

  approveJoiner(deviceId: string, allow: boolean): Promise<AckResult<Record<string, never>>> {
    return this.call(`approve:${deviceId}`, async () => {
      const res = await this.callEvent<'room:approve', Record<string, never>>('room:approve', { deviceId, allow });
      if (res.ok) usePeersStore.getState().resolvePending(deviceId);
      else useRoomStore.getState().setError({ code: res.code, message: friendlyError(res.code) });
      return res;
    });
  }

  async updateDeviceName(name: string): Promise<void> {
    const res = await this.callEvent<'device:update', Record<string, never>>('device:update', { name });
    if (!res.ok && res.code !== 'NETWORK') {
      useRoomStore.getState().setError({ code: res.code, message: friendlyError(res.code) });
    }
  }

  onSignal(listener: SignalListener): () => void {
    this.signalListeners.add(listener);
    return () => this.signalListeners.delete(listener);
  }

  /** Relay an SDP/ICE payload to a peer in the same room (TRD §7). */
  sendSignal(to: string, kind: 'description' | 'candidate', data: unknown): Promise<AckResult<Record<string, never>>> {
    return this.callEvent<'signal', Record<string, never>>('signal', { to, kind, data });
  }
}

let singleton: SignalingClient | null = null;

export function getSignalingClient(): SignalingClient {
  if (!singleton) singleton = new SignalingClient();
  return singleton;
}
