import type { ChunkWriter, WriterMeta } from './MemoryWriter.js';

let workerIdCounter = 1;

/**
 * OPFS storage backend for Firefox, Safari, and Android (TRD §10.3).
 * Stages incoming chunks in the Origin Private File System using a dedicated Web Worker
 * to execute non-blocking synchronous access handle writes.
 */
export class OpfsWriter implements ChunkWriter {
  private readonly transferId: number;
  private worker: Worker | null = null;
  private workerId = workerIdCounter++;
  private meta: WriterMeta | null = null;
  private fileHandle: FileSystemFileHandle | null = null;
  private finalizedFile: File | null = null;
  private aborted = false;

  constructor(transferId: number) {
    this.transferId = transferId;
  }

  async open(meta: WriterMeta): Promise<void> {
    this.meta = meta;
    this.aborted = false;

    if (
      typeof navigator === 'undefined' ||
      !('storage' in navigator) ||
      typeof navigator.storage?.getDirectory !== 'function'
    ) {
      throw new Error('OPFS is not supported in this environment');
    }

    const root = await navigator.storage.getDirectory();
    this.fileHandle = await root.getFileHandle(`dz_${this.transferId}.tmp`, { create: true });

    // Try starting dedicated worker
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(
          new URL('./opfsWrite.worker.ts', import.meta.url),
          { type: 'module' },
        );

        await new Promise<void>((resolve, reject) => {
          if (!this.worker) return reject(new Error('Worker not created'));
          const handler = (e: MessageEvent) => {
            if (e.data.id === this.workerId && e.data.type === 'opened') {
              this.worker?.removeEventListener('message', handler);
              resolve();
            } else if (e.data.id === this.workerId && e.data.type === 'error') {
              this.worker?.removeEventListener('message', handler);
              reject(new Error(e.data.error));
            }
          };
          this.worker.addEventListener('message', handler);
          this.worker.postMessage({
            type: 'open',
            id: this.workerId,
            transferId: this.transferId,
            size: meta.size,
            chunkSize: meta.chunkSize,
          });
        });
        return;
      } catch (err) {
        console.warn('Worker OPFS access handle failed; falling back to main-thread write:', err);
        this.worker?.terminate();
        this.worker = null;
      }
    }
  }

  async write(index: number, data: ArrayBuffer): Promise<void> {
    if (this.aborted) return;
    if (!this.meta || !this.fileHandle) throw new Error('Writer not open');

    if (this.worker) {
      await new Promise<void>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data.id === this.workerId && e.data.type === 'written') {
            this.worker?.removeEventListener('message', handler);
            resolve();
          } else if (e.data.id === this.workerId && e.data.type === 'error') {
            this.worker?.removeEventListener('message', handler);
            reject(new Error(e.data.error));
          }
        };
        this.worker?.addEventListener('message', handler);
        const copy = new Uint8Array(data);
        this.worker?.postMessage(
          {
            type: 'write',
            id: this.workerId,
            index,
            chunk: copy.buffer,
          },
          [copy.buffer],
        );
      });
      return;
    }

    // Fallback if worker is not used: createWritable
    if (typeof this.fileHandle.createWritable === 'function') {
      const writable = await this.fileHandle.createWritable({ keepExistingData: true });
      await writable.write({
        type: 'write',
        position: index * this.meta.chunkSize,
        data,
      });
      await writable.close();
    }
  }

  async flush(): Promise<void> {
    if (this.worker) {
      await new Promise<void>((resolve) => {
        const handler = (e: MessageEvent) => {
          if (e.data.id === this.workerId && e.data.type === 'flushed') {
            this.worker?.removeEventListener('message', handler);
            resolve();
          }
        };
        this.worker?.addEventListener('message', handler);
        this.worker?.postMessage({ type: 'flush', id: this.workerId });
      });
    }
  }

  async finalize(): Promise<{ saved: 'direct' | 'download' }> {
    if (this.aborted) throw new Error('Writer aborted');
    if (!this.fileHandle || !this.meta) throw new Error('Writer not open');

    if (this.worker) {
      await new Promise<void>((resolve) => {
        const handler = (e: MessageEvent) => {
          if (e.data.id === this.workerId && e.data.type === 'closed') {
            this.worker?.removeEventListener('message', handler);
            resolve();
          }
        };
        this.worker?.addEventListener('message', handler);
        this.worker?.postMessage({ type: 'close', id: this.workerId });
      });
      this.worker.terminate();
      this.worker = null;
    }

    const rawFile = await this.fileHandle.getFile();
    this.finalizedFile = new File([rawFile], this.meta.name, {
      type: this.meta.mime,
      lastModified: Date.now(),
    });

    return { saved: 'download' };
  }

  async *readSlices(sliceSize: number): AsyncIterable<Uint8Array> {
    if (!this.fileHandle && !this.finalizedFile) throw new Error('Writer not open');
    const file = this.finalizedFile ?? (await this.fileHandle!.getFile());
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

  getFile(): File | null {
    return this.finalizedFile;
  }

  async abort(): Promise<void> {
    this.aborted = true;
    if (this.worker) {
      this.worker.postMessage({ type: 'abort', id: this.workerId });
      this.worker.terminate();
      this.worker = null;
    }
    await this.cleanup();
  }

  async cleanup(): Promise<void> {
    try {
      if (
        typeof navigator !== 'undefined' &&
        'storage' in navigator &&
        typeof navigator.storage?.getDirectory === 'function'
      ) {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(`dz_${this.transferId}.tmp`);
      }
    } catch {
      // ignore cleanup errors
    }
    this.fileHandle = null;
    this.finalizedFile = null;
  }
}
