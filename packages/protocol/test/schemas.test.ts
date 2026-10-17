import { describe, it, expect } from 'vitest';
import {
  DeviceInfoSchema,
  RoomCreatePayloadSchema,
  RoomJoinPayloadSchema,
  RoomApprovePayloadSchema,
  DeviceUpdatePayloadSchema,
  SignalPayloadSchema,
  RoomCreateAckSchema,
  RoomJoinAckSchema,
  PeerInfoSchema,
} from '../src/signaling.js';
import {
  ControlMessageSchema,
  HelloMessageSchema,
  OfferMessageSchema,
  RejectMessageSchema,
} from '../src/control.js';

describe('Signaling schemas', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';
  const validDevice = {
    deviceId: validUuid,
    name: 'Alice MacBook',
    type: 'laptop' as const,
  };

  describe('DeviceInfoSchema', () => {
    it('parses valid DeviceInfo', () => {
      const parsed = DeviceInfoSchema.parse(validDevice);
      expect(parsed).toEqual(validDevice);
    });

    it('rejects invalid deviceId (not a UUID)', () => {
      expect(() =>
        DeviceInfoSchema.parse({
          ...validDevice,
          deviceId: 'invalid-id',
        }),
      ).toThrow();
    });

    it('rejects invalid device type', () => {
      expect(() =>
        DeviceInfoSchema.parse({
          ...validDevice,
          type: 'smartwatch',
        }),
      ).toThrow();
    });

    it('rejects empty device name', () => {
      expect(() =>
        DeviceInfoSchema.parse({
          ...validDevice,
          name: '',
        }),
      ).toThrow();
    });

    it('rejects device name longer than 50 chars', () => {
      expect(() =>
        DeviceInfoSchema.parse({
          ...validDevice,
          name: 'a'.repeat(51),
        }),
      ).toThrow();
    });

    it('rejects missing fields', () => {
      expect(() => DeviceInfoSchema.parse({})).toThrow();
    });
  });

  describe('RoomCreatePayloadSchema', () => {
    it('parses minimal room create payload', () => {
      const payload = { device: validDevice };
      const parsed = RoomCreatePayloadSchema.parse(payload);
      expect(parsed.device).toEqual(validDevice);
      expect(parsed.ttlSec).toBeUndefined();
      expect(parsed.requireApproval).toBeUndefined();
    });

    it('parses valid TTL options (300, 600, 1800, 3600)', () => {
      for (const ttl of [300, 600, 1800, 3600] as const) {
        const parsed = RoomCreatePayloadSchema.parse({
          device: validDevice,
          ttlSec: ttl,
          requireApproval: true,
        });
        expect(parsed.ttlSec).toBe(ttl);
        expect(parsed.requireApproval).toBe(true);
      }
    });

    it('rejects invalid TTL values', () => {
      expect(() =>
        RoomCreatePayloadSchema.parse({
          device: validDevice,
          ttlSec: 100,
        }),
      ).toThrow();

      expect(() =>
        RoomCreatePayloadSchema.parse({
          device: validDevice,
          ttlSec: '600',
        }),
      ).toThrow();
    });
  });

  describe('RoomJoinPayloadSchema', () => {
    it('parses valid join payload with 6-char code', () => {
      const payload = {
        code: 'ABC234',
        device: validDevice,
      };
      const parsed = RoomJoinPayloadSchema.parse(payload);
      expect(parsed.code).toBe('ABC234');
    });

    it('rejects codes that are not 6 chars', () => {
      expect(() =>
        RoomJoinPayloadSchema.parse({
          code: '12345',
          device: validDevice,
        }),
      ).toThrow();

      expect(() =>
        RoomJoinPayloadSchema.parse({
          code: '1234567',
          device: validDevice,
        }),
      ).toThrow();
    });
  });

  describe('RoomApprovePayloadSchema', () => {
    it('parses valid approval payload', () => {
      const payload = { deviceId: validUuid, allow: true };
      const parsed = RoomApprovePayloadSchema.parse(payload);
      expect(parsed.allow).toBe(true);
    });

    it('rejects invalid deviceId', () => {
      expect(() =>
        RoomApprovePayloadSchema.parse({ deviceId: 'bad-uuid', allow: false }),
      ).toThrow();
    });
  });

  describe('DeviceUpdatePayloadSchema', () => {
    it('parses valid update', () => {
      const parsed = DeviceUpdatePayloadSchema.parse({ name: 'New Name' });
      expect(parsed.name).toBe('New Name');
    });

    it('rejects empty name', () => {
      expect(() => DeviceUpdatePayloadSchema.parse({ name: '' })).toThrow();
    });
  });

  describe('SignalPayloadSchema', () => {
    it('parses valid description signal', () => {
      const payload = {
        to: validUuid,
        kind: 'description' as const,
        data: { type: 'offer', sdp: 'v=0...' },
      };
      const parsed = SignalPayloadSchema.parse(payload);
      expect(parsed.kind).toBe('description');
    });

    it('parses valid candidate signal', () => {
      const payload = {
        to: validUuid,
        kind: 'candidate' as const,
        data: { candidate: 'candidate:1...' },
      };
      const parsed = SignalPayloadSchema.parse(payload);
      expect(parsed.kind).toBe('candidate');
    });

    it('rejects invalid signal kind', () => {
      expect(() =>
        SignalPayloadSchema.parse({
          to: validUuid,
          kind: 'unknown',
          data: {},
        }),
      ).toThrow();
    });
  });

  describe('RoomCreateAckSchema & RoomJoinAckSchema', () => {
    it('parses RoomCreateAck', () => {
      const ack = {
        code: 'ABC234',
        codeExpiresAt: 1700000000,
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        peers: [{ device: validDevice, joinedAt: 1699999000 }],
      };
      const parsed = RoomCreateAckSchema.parse(ack);
      expect(parsed.code).toBe('ABC234');
      expect(parsed.peers).toHaveLength(1);
    });

    it('parses RoomJoinAck when accepted', () => {
      const ack = {
        code: 'ABC234',
        codeExpiresAt: 1700000000,
        iceServers: [],
        peers: [],
      };
      const parsed = RoomJoinAckSchema.parse(ack);
      expect('code' in parsed && parsed.code).toBe('ABC234');
    });

    it('parses RoomJoinAck when pending approval', () => {
      const ack = { pending: true as const };
      const parsed = RoomJoinAckSchema.parse(ack);
      expect('pending' in parsed && parsed.pending).toBe(true);
    });

    it('rejects invalid RoomJoinAck', () => {
      expect(() => RoomJoinAckSchema.parse({ pending: false })).toThrow();
    });
  });
});

describe('Control channel schemas', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  it('parses hello message', () => {
    const msg = {
      t: 'hello' as const,
      v: 1 as const,
      deviceId: validUuid,
      name: 'Bob',
      caps: {
        maxMessageSize: 65536,
        fsAccess: true,
        opfs: true,
        channels: 2,
      },
    };
    const parsed = ControlMessageSchema.parse(msg);
    expect(parsed.t).toBe('hello');
    expect(HelloMessageSchema.parse(msg)).toEqual(msg);
  });

  it('parses ping message', () => {
    const msg = { t: 'ping' as const, ts: 123456789 };
    const parsed = ControlMessageSchema.parse(msg);
    expect(parsed.t).toBe('ping');
  });

  it('parses pong message', () => {
    const msg = { t: 'pong' as const, ts: 123456789 };
    const parsed = ControlMessageSchema.parse(msg);
    expect(parsed.t).toBe('pong');
  });

  it('parses offer message', () => {
    const msg = {
      t: 'offer' as const,
      transferId: 42,
      name: 'document.pdf',
      size: 1048576,
      mime: 'application/pdf',
      lastModified: 1700000000,
      chunkSize: 16384,
      totalChunks: 64,
      channels: 1,
    };
    const parsed = ControlMessageSchema.parse(msg);
    expect(parsed.t).toBe('offer');
    expect(OfferMessageSchema.parse(msg)).toEqual(msg);
  });

  it('parses accept message', () => {
    const msg = { t: 'accept' as const, transferId: 42 };
    const parsed = ControlMessageSchema.parse(msg);
    expect(parsed.t).toBe('accept');
  });

  it('parses reject message for each reason', () => {
    const reasons = ['declined', 'no-space', 'too-large', 'busy'] as const;
    for (const reason of reasons) {
      const msg = { t: 'reject' as const, transferId: 42, reason };
      const parsed = ControlMessageSchema.parse(msg);
      expect(parsed.t).toBe('reject');
      expect(RejectMessageSchema.parse(msg).reason).toBe(reason);
    }
  });

  it('rejects invalid reject reason', () => {
    expect(() =>
      RejectMessageSchema.parse({
        t: 'reject',
        transferId: 42,
        reason: 'unknown-reason',
      }),
    ).toThrow();
  });

  it('parses ack message', () => {
    const msg = { t: 'ack' as const, transferId: 42, received: 64 };
    const parsed = ControlMessageSchema.parse(msg);
    expect(parsed.t).toBe('ack');
  });

  it('parses resume message', () => {
    const msg = { t: 'resume' as const, transferId: 42, bitmap: 'AQIDBA==', received: 16 };
    const parsed = ControlMessageSchema.parse(msg);
    expect(parsed.t).toBe('resume');
  });

  it('parses pause and continue messages', () => {
    const pause = { t: 'pause' as const, transferId: 42 };
    const cont = { t: 'continue' as const, transferId: 42 };
    expect(ControlMessageSchema.parse(pause).t).toBe('pause');
    expect(ControlMessageSchema.parse(cont).t).toBe('continue');
  });

  it('parses cancel message with and without reason', () => {
    const msgWithReason = { t: 'cancel' as const, transferId: 42, reason: 'user cancelled' };
    const msgWithoutReason = { t: 'cancel' as const, transferId: 42 };
    expect(ControlMessageSchema.parse(msgWithReason).t).toBe('cancel');
    expect(ControlMessageSchema.parse(msgWithoutReason).t).toBe('cancel');
  });

  it('parses sent-all message', () => {
    const msg = { t: 'sent-all' as const, transferId: 42 };
    expect(ControlMessageSchema.parse(msg).t).toBe('sent-all');
  });

  it('parses hash message', () => {
    const msg = {
      t: 'hash' as const,
      transferId: 42,
      algo: 'sha256' as const,
      hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
    expect(ControlMessageSchema.parse(msg).t).toBe('hash');
  });

  it('parses verified message with and without hex', () => {
    const verifiedOk = { t: 'verified' as const, transferId: 42, ok: true };
    const verifiedHex = {
      t: 'verified' as const,
      transferId: 42,
      ok: false,
      hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
    expect(ControlMessageSchema.parse(verifiedOk).t).toBe('verified');
    expect(ControlMessageSchema.parse(verifiedHex).t).toBe('verified');
  });

  it('parses text message', () => {
    const msg = { t: 'text' as const, id: 'msg-123', text: 'Hello WebRTC' };
    expect(ControlMessageSchema.parse(msg).t).toBe('text');
  });

  it('rejects unknown control message type', () => {
    expect(() =>
      ControlMessageSchema.parse({
        t: 'unknown-type',
        transferId: 42,
      }),
    ).toThrow();
  });

  it('rejects malformed control messages', () => {
    // Missing transferId in offer
    expect(() =>
      ControlMessageSchema.parse({
        t: 'offer',
        name: 'test.txt',
        size: 100,
      }),
    ).toThrow();

    // Floating point transferId
    expect(() =>
      ControlMessageSchema.parse({
        t: 'accept',
        transferId: 42.5,
      }),
    ).toThrow();
  });
});
