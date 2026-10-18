import { describe, it, expect } from 'vitest';
import { PrefetchQueue } from '../lib/transfer/PrefetchQueue.js';

describe('PrefetchQueue', () => {
  const content = '0123456789abcdefghijklmnopqrstuvwxyz';
  const file = new File([content], 'alphabet.txt', { type: 'text/plain' });

  it('reads chunks in order and exhausts queue', async () => {
    // 36 chars, chunkSize = 10 -> indices 0 (10), 1 (10), 2 (10), 3 (6)
    const queue = new PrefetchQueue(file, 10, [0, 1, 2, 3], 2);

    const chunk0 = await queue.take();
    expect(chunk0).not.toBeNull();
    expect(chunk0?.index).toBe(0);
    expect(chunk0?.buffer.byteLength).toBe(10);

    const chunk1 = await queue.take();
    expect(chunk1?.index).toBe(1);

    const chunk2 = await queue.take();
    expect(chunk2?.index).toBe(2);

    const chunk3 = await queue.take();
    expect(chunk3?.index).toBe(3);
    expect(chunk3?.buffer.byteLength).toBe(6);

    const done = await queue.take();
    expect(done).toBeNull();
  });

  it('supports reset with new indices', async () => {
    const queue = new PrefetchQueue(file, 10, [0, 1], 2);
    const chunk0 = await queue.take();
    expect(chunk0?.index).toBe(0);

    // Reset with missing index 2, 3
    queue.reset([2, 3]);
    const chunk2 = await queue.take();
    expect(chunk2?.index).toBe(2);
  });

  it('aborts cleanly', async () => {
    const queue = new PrefetchQueue(file, 10, [0, 1, 2, 3], 2);
    queue.abort();
    const result = await queue.take();
    expect(result).toBeNull();
  });
});
