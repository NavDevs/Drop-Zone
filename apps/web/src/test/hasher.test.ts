import { describe, it, expect } from 'vitest';
import { StreamHasher, computeFileHash, computeStreamHash } from '../lib/transfer/hasher.js';

describe('hasher', () => {
  // Known SHA-256 for "hello world": b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
  const text = 'hello world';
  const expectedHex = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';

  it('computes correct hash using StreamHasher update and digest', async () => {
    const hasher = new StreamHasher();
    await hasher.init();
    const encoder = new TextEncoder();
    await hasher.update(encoder.encode('hello '));
    await hasher.update(encoder.encode('world'));
    const hex = await hasher.digest();
    expect(hex).toBe(expectedHex);
  });

  it('computes correct hash for a File object', async () => {
    const file = new File([text], 'test.txt', { type: 'text/plain' });
    let lastProgress = 0;
    const hex = await computeFileHash(file, 4, (processed, total) => {
      lastProgress = processed / total;
    });
    expect(hex).toBe(expectedHex);
    expect(lastProgress).toBe(1);
  });

  it('computes correct hash for an async iterable of slices', async () => {
    async function* getSlices() {
      const encoder = new TextEncoder();
      yield encoder.encode('hello ');
      yield encoder.encode('world');
    }

    const hex = await computeStreamHash(getSlices());
    expect(hex).toBe(expectedHex);
  });
});
