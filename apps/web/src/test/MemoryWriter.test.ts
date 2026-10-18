import { describe, it, expect } from 'vitest';
import { MemoryWriter } from '../lib/transfer/MemoryWriter.js';

describe('MemoryWriter', () => {
  it('opens and positional-writes chunks, then finalizes into a File', async () => {
    const writer = new MemoryWriter();
    const meta = {
      name: 'hello.txt',
      size: 11,
      mime: 'text/plain',
      chunkSize: 5,
      totalChunks: 3,
    };

    await writer.open(meta);

    // Write chunk 1, then chunk 0, then chunk 2 (out of order arrival)
    const encoder = new TextEncoder();
    const chunk0 = encoder.encode('Hello').buffer;
    const chunk1 = encoder.encode(' worl').buffer;
    const chunk2 = encoder.encode('d').buffer;

    await writer.write(1, chunk1);
    await writer.write(0, chunk0);
    await writer.write(2, chunk2);

    expect(writer.receivedBytes()).toBe(11);

    const result = await writer.finalize();
    expect(result.saved).toBe('download');

    const file = writer.getFile();
    expect(file).not.toBeNull();
    expect(file?.name).toBe('hello.txt');
    expect(file?.size).toBe(11);

    const text = await file?.text();
    expect(text).toBe('Hello world');
  });

  it('rejects files larger than the 500 MB memory cap', async () => {
    const writer = new MemoryWriter();
    await expect(
      writer.open({
        name: 'huge.iso',
        size: 600 * 1024 * 1024,
        mime: 'application/octet-stream',
        chunkSize: 16384,
        totalChunks: 38400,
      }),
    ).rejects.toThrow('too-large');
  });

  it('throws when writing out-of-range chunk indices', async () => {
    const writer = new MemoryWriter();
    await writer.open({
      name: 'test.bin',
      size: 10,
      mime: 'application/octet-stream',
      chunkSize: 5,
      totalChunks: 2,
    });

    await expect(writer.write(5, new ArrayBuffer(5))).rejects.toThrow('out of range');
  });

  it('allows iterating slices for hash verification', async () => {
    const writer = new MemoryWriter();
    await writer.open({
      name: 'slices.txt',
      size: 12,
      mime: 'text/plain',
      chunkSize: 6,
      totalChunks: 2,
    });

    const encoder = new TextEncoder();
    await writer.write(0, encoder.encode('ABCDEF').buffer);
    await writer.write(1, encoder.encode('GHIJKL').buffer);
    await writer.finalize();

    const chunks: Uint8Array[] = [];
    for await (const slice of writer.readSlices(4)) {
      chunks.push(slice);
    }

    expect(chunks.length).toBe(3);
    const decoder = new TextDecoder();
    expect(decoder.decode(chunks[0])).toBe('ABCD');
    expect(decoder.decode(chunks[1])).toBe('EFGH');
    expect(decoder.decode(chunks[2])).toBe('IJKL');
  });

  it('cleans up buffers on abort', async () => {
    const writer = new MemoryWriter();
    await writer.open({
      name: 'abort.bin',
      size: 100,
      mime: 'application/octet-stream',
      chunkSize: 50,
      totalChunks: 2,
    });

    await writer.write(0, new ArrayBuffer(50));
    await writer.abort();

    expect(writer.getFile()).toBeNull();
    expect(writer.receivedBytes()).toBe(0);
    await expect(writer.finalize()).rejects.toThrow('aborted');
  });
});
