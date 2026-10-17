import { FRAME_HEADER_SIZE, FRAME_VERSION, FRAME_TYPE_DATA } from './constants.js';

export function encodeFrame(transferId: number, chunkIndex: number, payload: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(FRAME_HEADER_SIZE + payload.byteLength);
  const view = new DataView(buf);
  view.setUint8(0, FRAME_VERSION);
  view.setUint8(1, FRAME_TYPE_DATA);
  view.setUint16(2, 0); // flags reserved
  view.setUint32(4, transferId);
  view.setUint32(8, chunkIndex);
  new Uint8Array(buf, FRAME_HEADER_SIZE).set(payload);
  return buf;
}

export interface DecodedFrame {
  version: number;
  type: number;
  flags: number;
  transferId: number;
  chunkIndex: number;
  payload: Uint8Array;
}

export function decodeFrame(buf: ArrayBuffer): DecodedFrame {
  if (buf.byteLength < FRAME_HEADER_SIZE) {
    throw new Error(`Frame too short: ${buf.byteLength} bytes, need at least ${FRAME_HEADER_SIZE}`);
  }
  const view = new DataView(buf);
  const version = view.getUint8(0);
  if (version !== FRAME_VERSION) {
    throw new Error(`Unsupported frame version: ${version}`);
  }
  const type = view.getUint8(1);
  if (type !== FRAME_TYPE_DATA) {
    throw new Error(`Unknown frame type: ${type}`);
  }
  const flags = view.getUint16(2);
  const transferId = view.getUint32(4);
  const chunkIndex = view.getUint32(8);
  const payload = new Uint8Array(buf, FRAME_HEADER_SIZE);
  return { version, type, flags, transferId, chunkIndex, payload };
}
