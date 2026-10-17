import { describe, it, expect } from 'vitest';
import { encodeFrame, decodeFrame } from '../src/frame.js';
import { FRAME_HEADER_SIZE, FRAME_VERSION, FRAME_TYPE_DATA } from '../src/constants.js';

describe('frame encode and decode', () => {
  it('roundtrips random payload to identical values', () => {
    const transferId = 12345;
    const chunkIndex = 42;
    const payload = new Uint8Array(256);
    for (let i = 0; i < payload.length; i++) {
      payload[i] = Math.floor(Math.random() * 256);
    }

    const encoded = encodeFrame(transferId, chunkIndex, payload);
    const decoded = decodeFrame(encoded);

    expect(decoded.version).toBe(FRAME_VERSION);
    expect(decoded.type).toBe(FRAME_TYPE_DATA);
    expect(decoded.flags).toBe(0);
    expect(decoded.transferId).toBe(transferId);
    expect(decoded.chunkIndex).toBe(chunkIndex);
    expect(decoded.payload).toEqual(payload);
  });

  it('handles minimum frame (0-byte payload)', () => {
    const payload = new Uint8Array(0);
    const encoded = encodeFrame(1, 0, payload);
    expect(encoded.byteLength).toBe(FRAME_HEADER_SIZE);

    const decoded = decodeFrame(encoded);
    expect(decoded.version).toBe(FRAME_VERSION);
    expect(decoded.type).toBe(FRAME_TYPE_DATA);
    expect(decoded.transferId).toBe(1);
    expect(decoded.chunkIndex).toBe(0);
    expect(decoded.payload.byteLength).toBe(0);
  });

  it('handles max uint32 transferId and chunkIndex', () => {
    const maxUint32 = 0xffffffff;
    const payload = new Uint8Array([1, 2, 3]);
    const encoded = encodeFrame(maxUint32, maxUint32, payload);
    const decoded = decodeFrame(encoded);

    expect(decoded.transferId).toBe(maxUint32);
    expect(decoded.chunkIndex).toBe(maxUint32);
    expect(decoded.payload).toEqual(payload);
  });

  it('throws when frame is too short (< 12 bytes)', () => {
    for (let len = 0; len < FRAME_HEADER_SIZE; len++) {
      const shortBuf = new ArrayBuffer(len);
      expect(() => decodeFrame(shortBuf)).toThrow(/Frame too short/);
    }
  });

  it('throws on wrong frame version', () => {
    const buf = new ArrayBuffer(FRAME_HEADER_SIZE);
    const view = new DataView(buf);
    view.setUint8(0, 99);
    view.setUint8(1, FRAME_TYPE_DATA);
    expect(() => decodeFrame(buf)).toThrow(/Unsupported frame version: 99/);
  });

  it('throws on wrong frame type', () => {
    const buf = new ArrayBuffer(FRAME_HEADER_SIZE);
    const view = new DataView(buf);
    view.setUint8(0, FRAME_VERSION);
    view.setUint8(1, 99);
    expect(() => decodeFrame(buf)).toThrow(/Unknown frame type: 99/);
  });

  it('handles boundary payload of exactly 1 byte', () => {
    const payload = new Uint8Array([0xab]);
    const encoded = encodeFrame(100, 200, payload);
    expect(encoded.byteLength).toBe(FRAME_HEADER_SIZE + 1);

    const decoded = decodeFrame(encoded);
    expect(decoded.payload.byteLength).toBe(1);
    expect(decoded.payload[0]).toBe(0xab);
  });

  it('handles large payload (64 KB)', () => {
    const size = 64 * 1024;
    const payload = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      payload[i] = i % 256;
    }

    const encoded = encodeFrame(999, 888, payload);
    expect(encoded.byteLength).toBe(FRAME_HEADER_SIZE + size);

    const decoded = decodeFrame(encoded);
    expect(decoded.transferId).toBe(999);
    expect(decoded.chunkIndex).toBe(888);
    expect(decoded.payload.byteLength).toBe(size);
    expect(decoded.payload).toEqual(payload);
  });
});
