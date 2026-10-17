import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  ProtocolErrorSchema,
  isProtocolError,
} from '../src/errors.js';
import { RoomClosePayloadSchema } from '../src/signaling.js';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CREATE_RATE_LIMIT,
  ROOM_CREATE_RATE_WINDOW_SEC,
  ROOM_JOIN_RATE_LIMIT,
  ROOM_JOIN_RATE_WINDOW_SEC,
  JOIN_FAIL_LOCKOUT_THRESHOLD,
  JOIN_FAIL_LOCKOUT_SEC,
  SIGNAL_RATE_LIMIT,
  SIGNAL_RATE_WINDOW_SEC,
  ROOM_CODE_FREED_RETENTION_SEC,
  ROOM_SWEEP_INTERVAL_SEC,
  ICE_REFRESH_MARGIN_SEC,
} from '../src/constants.js';

describe('ProtocolErrorSchema', () => {
  it('parses every defined error code', () => {
    for (const code of Object.values(ErrorCode)) {
      const parsed = ProtocolErrorSchema.parse({ code, message: 'x' });
      expect(parsed.code).toBe(code);
    }
  });

  it('rejects unknown error codes', () => {
    expect(() => ProtocolErrorSchema.parse({ code: 'NOPE', message: 'x' })).toThrow();
  });

  it('rejects missing message', () => {
    expect(() => ProtocolErrorSchema.parse({ code: ErrorCode.INTERNAL })).toThrow();
  });

  it('isProtocolError narrows correctly', () => {
    expect(isProtocolError({ code: 'ROOM_FULL', message: 'full' })).toBe(true);
    expect(isProtocolError({ code: 'BOGUS', message: 'x' })).toBe(false);
    expect(isProtocolError(null)).toBe(false);
    expect(isProtocolError('ROOM_FULL')).toBe(false);
  });
});

describe('RoomClosePayloadSchema', () => {
  it('accepts an empty object', () => {
    expect(RoomClosePayloadSchema.parse({})).toEqual({});
  });

  it('strips unexpected fields', () => {
    expect(RoomClosePayloadSchema.parse({ reason: 'x' })).toEqual({});
  });
});

describe('Signaling rate-limit constants', () => {
  it('matches TRD §5 limits', () => {
    expect(ROOM_CREATE_RATE_LIMIT).toBe(10);
    expect(ROOM_CREATE_RATE_WINDOW_SEC).toBe(3600);
    expect(ROOM_JOIN_RATE_LIMIT).toBe(10);
    expect(ROOM_JOIN_RATE_WINDOW_SEC).toBe(60);
    expect(JOIN_FAIL_LOCKOUT_THRESHOLD).toBe(5);
    expect(JOIN_FAIL_LOCKOUT_SEC).toBe(900);
    expect(SIGNAL_RATE_LIMIT).toBe(100);
    expect(SIGNAL_RATE_WINDOW_SEC).toBe(10);
  });

  it('keeps the room-code alphabet free of ambiguous characters', () => {
    for (const ambiguous of ['I', 'L', 'O', '0', '1']) {
      expect(ROOM_CODE_ALPHABET.includes(ambiguous)).toBe(false);
    }
  });

  it('defines code retention, sweep, and ICE refresh margins', () => {
    expect(ROOM_CODE_FREED_RETENTION_SEC).toBe(3600);
    expect(ROOM_SWEEP_INTERVAL_SEC).toBe(30);
    expect(ICE_REFRESH_MARGIN_SEC).toBe(60);
  });
});
