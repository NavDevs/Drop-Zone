import { describe, it, expect } from 'vitest';
import { encodeFrame, decodeFrame, FRAME_HEADER_SIZE } from '../src/frame.js';

describe('Frame parser robustness & fuzzing', () => {
  it('rejects buffers shorter than header size', () => {
    for (let len = 0; len < FRAME_HEADER_SIZE; len++) {
      const buf = new ArrayBuffer(len);
      expect(() => decodeFrame(buf)).toThrow(/Frame too short/);
    }
  });

  it('rejects unsupported version numbers', () => {
    const valid = encodeFrame(1, 0, new Uint8Array([1, 2, 3]));
    const view = new DataView(valid);
    for (const v of [0, 2, 3, 99, 255]) {
      view.setUint8(0, v);
      expect(() => decodeFrame(valid)).toThrow(/Unsupported frame version/);
    }
  });

  it('rejects unknown frame types', () => {
    const valid = encodeFrame(1, 0, new Uint8Array([1, 2, 3]));
    const view = new DataView(valid);
    for (const t of [0, 2, 5, 255]) {
      view.setUint8(1, t);
      expect(() => decodeFrame(valid)).toThrow(/Unknown frame type/);
    }
  });

  it('handles random fuzz buffers safely without throwing unexpected errors', () => {
    // Generate pseudo-random buffers of varying lengths and feed into decodeFrame
    let seed = 123456789;
    const nextRandom = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };

    for (let test = 0; test < 100; test++) {
      const length = nextRandom() % 256;
      const buf = new ArrayBuffer(length);
      const u8 = new Uint8Array(buf);
      for (let i = 0; i < length; i++) {
        u8[i] = nextRandom() & 0xff;
      }

      try {
        const decoded = decodeFrame(buf);
        // If it decoded, it must satisfy all header constraints
        expect(decoded.version).toBe(1);
        expect(decoded.type).toBe(1);
        expect(decoded.payload.byteLength).toBe(length - FRAME_HEADER_SIZE);
      } catch (err) {
        // Expected protocol parser error
        expect(err).toBeInstanceOf(Error);
      }
    }
  });
});
