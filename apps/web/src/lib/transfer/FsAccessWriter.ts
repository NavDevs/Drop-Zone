import type { ChunkWriter, WriterMeta } from './MemoryWriter.js';

/**
 * Chromium desktop storage backend using File System Access API (TRD §10.3).
 * Writes chunks positionally to disk as they arrive.
 */
export class FsAccessWriter implements ChunkWriter {
  private handle: FileSystemFileHandle | null = null;
  private writable: FileSystemWritableFileStream | null = null;
  private meta: WriterMeta | null = null;
  private aborted = false;

  constructor(existingHandle?: FileSystemFileHandle) {
    if (existingHandle) {
      this.handle = existingHandle;
    }
  }

  getHandle(): FileSystemFileHandle | null {
    return this.handle;
  }

  async open(meta: WriterMeta): Promise<void> {
    this.meta = meta;
    this.aborted = false;

    if (!this.handle) {
      if (typeof window === 'undefined' || !('showSaveFilePicker' in window)) {
        throw new Error('File System Access API is not supported in this browser');
      }

      const picker = (
        window as unknown as {
          showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
        }
      ).showSaveFilePicker;
      if (!picker) {
        throw new Error('showSaveFilePicker is not available');
      }
      this.handle = await picker({
        suggestedName: meta.name,
      });
    }

    if (!this.handle) {
      throw new Error('Failed to acquire FileSystemFileHandle');
    }
    this.writable = await this.handle.createWritable({ keepExistingData: true });
    // Pre-truncate / allocate file size if known
    if (meta.size > 0) {
      await this.writable.truncate(meta.size);
    }
  }

  async write(index: number, data: ArrayBuffer): Promise<void> {
    if (this.aborted) return;
    if (!this.writable || !this.meta) {
      throw new Error('Writer not open');
    }
    const position = index * this.meta.chunkSize;
    await this.writable.write({
      type: 'write',
      position,
      data,
    });
  }

  async flush(): Promise<void> {
    // FileSystemWritableFileStream flushes on close/write
  }

  async finalize(): Promise<{ saved: 'direct' | 'download' }> {
    if (this.aborted) throw new Error('Writer aborted');
    if (!this.writable) throw new Error('Writer not open');

    await this.writable.close();
    this.writable = null;
    return { saved: 'direct' };
  }

  async *readSlices(sliceSize: number): AsyncIterable<Uint8Array> {
    if (!this.handle) throw new Error('Writer not open');
    const file = await this.handle.getFile();
    const total = file.size;
    let offset = 0;

    while (offset < total) {
      const end = Math.min(offset + sliceSize, total);
      const slice = file.slice(offset, end);
      const buf = await slice.arrayBuffer();
      yield new Uint8Array(buf);
      offset = end;
    }
  }

  async abort(): Promise<void> {
    this.aborted = true;
    if (this.writable) {
      try {
        await this.writable.abort();
      } catch {
        // ignore abort errors
      }
      this.writable = null;
    }
  }
}
