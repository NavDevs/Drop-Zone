import type {
  RoomCreatePayload,
  RoomCreateAck,
  RoomJoinPayload,
  RoomJoinAck,
  RoomLeavePayload,
  RoomRegenerateAck,
  RoomApprovePayload,
  RoomClosePayload,
  DeviceUpdatePayload,
  SignalPayload,
  PeerJoinedPayload,
  PeerLeftPayload,
  PeerUpdatedPayload,
  JoinRequestPayload,
  RelayedSignalPayload,
  RoomClosedPayload,
  RoomCodeChangedPayload,
  IceRefreshPayload,
  ProtocolError,
} from '@dropzone/protocol';

/** Every ack from the server is either the success payload or an error envelope (DECISIONS 2026-10-17). */
export type AckEnvelope<T> = T | { error: ProtocolError };

export type AckResult<T> = { ok: true; data: T } | { ok: false; code: ProtocolError['code'] | 'NETWORK'; message: string };

export function unwrapAck<T>(res: AckEnvelope<T>): AckResult<T> {
  if (res !== null && typeof res === 'object' && 'error' in res && res.error !== undefined) {
    return { ok: false, code: res.error.code, message: res.error.message };
  }
  return { ok: true, data: res as T };
}

type EmptyAck = Record<string, never>;

/** Server → client events (mirror of apps/signaling ServerToClientEvents). */
export interface SignalingServerEvents {
  'peer:joined': (payload: PeerJoinedPayload) => void;
  'peer:left': (payload: PeerLeftPayload) => void;
  'peer:updated': (payload: PeerUpdatedPayload) => void;
  'join:request': (payload: JoinRequestPayload) => void;
  signal: (payload: RelayedSignalPayload) => void;
  'room:closed': (payload: RoomClosedPayload) => void;
  'room:codeChanged': (payload: RoomCodeChangedPayload) => void;
  'ice:refresh': (payload: IceRefreshPayload) => void;
}

/** Client → server events (payload + ack per TRD §5). */
export interface SignalingClientEvents {
  'room:create': (payload: RoomCreatePayload, ack: (res: AckEnvelope<RoomCreateAck>) => void) => void;
  'room:join': (payload: RoomJoinPayload, ack: (res: AckEnvelope<RoomJoinAck>) => void) => void;
  'room:leave': (payload: RoomLeavePayload, ack: (res: AckEnvelope<EmptyAck>) => void) => void;
  'room:regenerate': (payload: RoomClosePayload, ack: (res: AckEnvelope<RoomRegenerateAck>) => void) => void;
  'room:approve': (payload: RoomApprovePayload, ack: (res: AckEnvelope<EmptyAck>) => void) => void;
  'room:close': (payload: RoomClosePayload, ack: (res: AckEnvelope<EmptyAck>) => void) => void;
  'device:update': (payload: DeviceUpdatePayload, ack: (res: AckEnvelope<EmptyAck>) => void) => void;
  signal: (payload: SignalPayload, ack: (res: AckEnvelope<EmptyAck>) => void) => void;
}
