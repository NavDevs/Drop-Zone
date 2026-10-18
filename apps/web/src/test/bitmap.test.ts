import { describe, it, expect } from 'vitest';
import { ChunkBitmap } from '../lib/transfer/bitmap.js';

describe('ChunkBitmap', () => {
  it('initializes with correct size and empty state', () => {
    const bitmap = new ChunkBitmap(20);
    expect(bitmap.totalChunks).toBe(20);
    expect(bitmap.count()).toBe(0);
    expect(bitmap.isComplete()).toBe(false);
    expect(bitmap.missingIndices()).toHaveLength(20);
  });

  it('sets and checks individual bits', () => {
    const bitmap = new ChunkBitmap(10);
    expect(bitmap.has(0)).toBe(false);
    bitmap.set(0);
    expect(bitmap.has(0)).toBe(true);
    expect(bitmap.count()).toBe(1);

    bitmap.set(9);
    expect(bitmap.has(9)).toBe(true);
    expect(bitmap.has(5)).toBe(false);
    expect(bitmap.count()).toBe(2);

    // Setting same bit twice does not double-count
    bitmap.set(0);
    expect(bitmap.count()).toBe(2);
  });

  it('throws when setting out of range indices', () => {
    const bitmap = new ChunkBitmap(5);
    expect(() => bitmap.set(-1)).toThrow();
    expect(() => bitmap.set(5)).toThrow();
  });

  it('returns missing indices correctly', () => {
    const bitmap = new ChunkBitmap(5);
    bitmap.set(0);
    bitmap.set(2);
    bitmap.set(4);
    expect(bitmap.missingIndices()).toEqual([1, 3]);
  });

  it('reports isComplete when all bits are set', () => {
    const bitmap = new ChunkBitmap(4);
    bitmap.set(0);
    bitmap.set(1);
    bitmap.set(2);
    expect(bitmap.isComplete()).toBe(false);
    bitmap.set(3);
    expect(bitmap.isComplete()).toBe(true);
  });

  it('serializes to base64 and roundtrips', () => {
    const original = new ChunkBitmap(64);
    original.set(0);
    original.set(7);
    original.set(8);
    original.set(15);
    original.set(63);

    const b64 = original.toBase64();
    const restored = ChunkBitmap.fromBase64(b64, 64);

    expect(restored.totalChunks).toBe(64);
    expect(restored.count()).toBe(original.count());
    for (let i = 0; i < 64; i++) {
      expect(restored.has(i)).toBe(original.has(i));
    }
  });

  it('handles empty and full factories', () => {
    const empty = ChunkBitmap.empty(16);
    expect(empty.count()).toBe(0);

    const full = ChunkBitmap.full(16);
    expect(full.count()).toBe(16);
    expect(full.isComplete()).toBe(true);
    expect(full.missingIndices()).toEqual([]);
  });
});
