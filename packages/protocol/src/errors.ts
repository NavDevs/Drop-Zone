export const ErrorCode = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_EXPIRED: 'ROOM_EXPIRED',
  ROOM_FULL: 'ROOM_FULL',
  JOIN_DENIED: 'JOIN_DENIED',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  PEER_NOT_FOUND: 'PEER_NOT_FOUND',
  NOT_HOST: 'NOT_HOST',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ProtocolError {
  code: ErrorCode;
  message: string;
}
