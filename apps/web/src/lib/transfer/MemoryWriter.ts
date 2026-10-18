import { MEMORY_WRITER_MAX_SIZE } from '@dropzone/protocol';

/** Storage backend contract (TRD §10.3). Phase 5 ships MemoryWriter only. */
export interface WriterMeta {
  name: string;
  size: number;
  mime: string;
  chunkSize: number;
  totalChunks: number;
}

export interface ChunkWriter {
  open(meta: WriterMeta): Promise<void>;
  write(index: number, data: ArrayBuffer): Promise<void>;
  flush(): Promise<void>;
  finalize(): Promise<{ saved: 'direct' | 'download' }>;
  readSlices(sliceSize: number): AsyncIterable<Uint8Array>;
  abort(): Promise<void>;
}

/**
 * In-RAM writer: positional writes into per-chunk parts, assembled into a File
 * at finalize (TRD §10.3 "MemoryWriter — in-RAM Blob parts, hard cap 500 MB").
 * Nothing touches disk; the UI triggers the download with an explicit user click.
 */
export class MemoryWriter implements ChunkWriter {
  private parts: (Uint8Array | undefined)[] | null = null;
  private meta: WriterMeta | null = null;
  private file: File | null = null;
  private bytes = 0;
  private aborted = false;

  async open(meta: WriterMeta): Promise<void> {
    if (meta.size > MEMORY_WRITER_MAX_SIZE) {
      throw new Error(`too-large: ${meta.size} bytes exceeds the ${MEMORY_WRITER_MAX_SIZE} byte memory cap`);
    }
    this.meta = meta;
    this.parts = new Array<Uint8Array | undefined>(meta.totalChunks);
    this.bytes = 0;
    this.file = null;
    this.aborted = false;
  }

  async write(index: number, data: ArrayBuffer): Promise<void> {
    if (!this.parts || !this.meta) throw new Error('writer not open');
    if (this.aborted) return;
    if (index < 0 || index >= this.meta.totalChunks) {
      throw new Error(`index ${index} out of range (totalChunks ${this.meta.totalChunks})`);
    }
    if (this.parts[index] === undefined) this.bytes += data.byteLength;
    this.parts[index] = new Uint8Array(data);
  }

  async flush(): Promise<void> {
    // Memory backend has nothing durable to flush; kept for the interface.
  }

  async finalize(): Promise<{ saved: 'direct' | 'download' }> {
    if (this.aborted) throw new Error('writer aborted');
    if (!this.parts || !this.meta) throw new Error('writer not open');
    const ordered: BlobPart[] = [];
    for (let i = 0; i < this.meta.totalChunks; i++) {
      const part = this.parts[i];
      if (!part) throw new Error(`missing chunk ${i} at finalize`);
      ordered.push(part.buffer as ArrayBuffer);
    }
    this.file = new File(ordered, this.meta.name, { type: this.meta.mime });
    this.parts = null;
    return { saved: 'download' };
  }

  async *readSlices(sliceSize: number): AsyncIterable<Uint8Array> {
    if (!this.file) {
      this.mergeParts();
    }
    if (!this.file) throw new Error('writer not open');
    const totalSize = this.file.size;
    for (let offset = 0; offset < totalSize; offset += sliceSize) {
      const end = Math.min(offset + sliceSize, totalSize);
      const buf = await this.file.slice(offset, end).arrayBuffer();
      yield new Uint8Array(buf);
    }
  }

  async abort(): Promise<void> {
    this.aborted = true;
    this.parts = null;
    this.file = null;
    this.bytes = 0;
  }

  /** The received file; available after finalize (for download links). */
  getFile(): File | null {
    return this.file;
  }

  receivedBytes(): number {
    return this.bytes;
  }

  private mergeParts(): File | null {
    if (!this.parts || !this.meta) return null;
    const parts: BlobPart[] = [];
    for (let i = 0; i < this.meta.totalChunks; i++) {
      const part = this.parts[i];
      if (part) parts.push(part.buffer as ArrayBuffer);
    }
    this.file = new File(parts, this.meta.name, { type: this.meta.mime });
    return this.file;
  }
}
