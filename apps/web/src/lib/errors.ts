import type { ErrorCode } from '@dropzone/protocol';

/** Plain-language, next-action error copy (WORKING.md §3, PRD §8). */
export function friendlyError(code: ErrorCode | 'NETWORK'): string {
  switch (code) {
    case 'ROOM_NOT_FOUND':
    case 'ROOM_EXPIRED':
      return 'Code not found or expired. Ask for a new one.';
    case 'ROOM_FULL':
      return "This room is full — up to 8 devices can join. Ask for a new room.";
    case 'RATE_LIMITED':
      return 'Too many attempts. Wait a minute, then try again.';
    case 'JOIN_DENIED':
      return "The host didn't let you in. Ask them to approve you.";
    case 'NOT_IN_ROOM':
      return "You're not in a room anymore.";
    case 'NOT_HOST':
      return 'Only the host can do that.';
    case 'PEER_NOT_FOUND':
      return "That device isn't in the room.";
    case 'INVALID_PAYLOAD':
      return 'Something went wrong. Please try again.';
    case 'INTERNAL':
      return 'Server error. Please try again.';
    case 'NETWORK':
      return "Can't reach the signaling server. Reconnecting…";
  }
}

export function roomClosedReason(reason: string): string {
  switch (reason) {
    case 'JOIN_DENIED':
      return "The host didn't let you in. Ask them to approve you.";
    case 'HOST_CLOSED':
      return 'The host closed the room.';
    case 'IDLE_TIMEOUT':
      return 'The room was idle too long and closed.';
    case 'HARD_EXPIRY':
      return 'The room reached its 6-hour limit and closed.';
    case 'ROOM_EMPTY':
      return 'The room closed because everyone left.';
    default:
      return 'The room closed.';
  }
}
