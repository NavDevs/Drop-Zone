import type { Server, Socket } from 'socket.io';
import type { Logger } from 'pino';
import type {
  PeerJoinedPayload,
  PeerLeftPayload,
  PeerUpdatedPayload,
  JoinRequestPayload,
  RelayedSignalPayload,
  RoomClosedPayload,
  RoomCodeChangedPayload,
  IceRefreshPayload,
} from '@dropzone/protocol';
import type { RoomStore } from '../rooms/RoomStore.js';
import type { Limits } from '../limits.js';
import type { Metrics } from '../metrics.js';
import type { IssuedIce } from '../ice.js';

export interface SocketData {
  deviceId?: string;
  deviceName?: string;
  roomId?: string;
  iceTimer?: ReturnType<typeof setTimeout>;
}

/** Client→server events; payloads arrive as unknown and are zod-validated. */
export interface ClientToServerEvents {
  'room:create': (payload: unknown, ack: (res: unknown) => void) => void;
  'room:join': (payload: unknown, ack: (res: unknown) => void) => void;
  'room:leave': (payload: unknown, ack: (res: unknown) => void) => void;
  'room:regenerate': (payload: unknown, ack: (res: unknown) => void) => void;
  'room:approve': (payload: unknown, ack: (res: unknown) => void) => void;
  'room:close': (payload: unknown, ack: (res: unknown) => void) => void;
  'device:update': (payload: unknown, ack: (res: unknown) => void) => void;
  signal: (payload: unknown, ack: (res: unknown) => void) => void;
}

/** Server→client events; payloads come from protocol schemas. */
export interface ServerToClientEvents {
  'peer:joined': (payload: PeerJoinedPayload) => void;
  'peer:left': (payload: PeerLeftPayload) => void;
  'peer:updated': (payload: PeerUpdatedPayload) => void;
  'join:request': (payload: JoinRequestPayload) => void;
  signal: (payload: RelayedSignalPayload) => void;
  'room:closed': (payload: RoomClosedPayload) => void;
  'room:codeChanged': (payload: RoomCodeChangedPayload) => void;
  'ice:refresh': (payload: IceRefreshPayload) => void;
}

export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface IceIssuer {
  issue(deviceId: string): IssuedIce;
}

export interface AppContext {
  store: RoomStore;
  limits: Limits;
  ice: IceIssuer;
  metrics: Metrics;
  logger: Logger;
  io: AppServer;
  /** Called when a device is admitted to a room (schedule ICE refresh, etc.). */
  admit(socket: AppSocket, deviceId: string): void;
}
