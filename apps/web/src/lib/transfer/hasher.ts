import { createSHA256 } from 'hash-wasm';

const SLICE_SIZE = 4 * 1024 * 1024; // 4 MiB slices per TRD §11

let idCounter = 1;

/**
 * Streaming SHA-256 calculator that delegates to a Web Worker when available,
 * with inline hash-wasm fallback for tests or environments without worker support (TRD §11).
 */
export class StreamHasher {
  private id = idCounter++;
  private worker: Worker | null = null;
  private inlineHasher: Awaited<ReturnType<typeof createSHA256>> | null = null;
  private isReady = false;
  private readyPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(
          new URL('./hash.worker.ts', import.meta.url),
          { type: 'module' },
        );
        this.readyPromise = new Promise((resolve, reject) => {
          if (!this.worker) return reject(new Error('Worker missing'));
          const handler = (e: MessageEvent) => {
            if (e.data.id === this.id && e.data.type === 'ready') {
              this.worker?.removeEventListener('message', handler);
              this.isReady = true;
              resolve();
            } else if (e.data.id === this.id && e.data.type === 'error') {
              this.worker?.removeEventListener('message', handler);
              reject(new Error(e.data.error));
            }
          };
          this.worker.addEventListener('message', handler);
          this.worker.postMessage({ type: 'init', id: this.id });
        });
        await this.readyPromise;
        return;
      } catch {
        // Fallback to inline hasher below
        this.worker = null;
      }
    }

    const hasher = await createSHA256();
    hasher.init();
    this.inlineHasher = hasher;
    this.isReady = true;
  }

  async update(chunk: Uint8Array): Promise<void> {
    if (!this.isReady) await this.init();

    if (this.worker) {
      await new Promise<void>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data.id === this.id && e.data.type === 'updated') {
            this.worker?.removeEventListener('message', handler);
            resolve();
          } else if (e.data.id === this.id && e.data.type === 'error') {
            this.worker?.removeEventListener('message', handler);
            reject(new Error(e.data.error));
          }
        };
        this.worker?.addEventListener('message', handler);
        // Transfer buffer copy to avoid blocking
        const copy = new Uint8Array(chunk);
        this.worker?.postMessage(
          { type: 'update', id: this.id, chunk: copy.buffer },
          [copy.buffer],
        );
      });
    } else if (this.inlineHasher) {
      this.inlineHasher.update(chunk);
    }
  }

  async digest(): Promise<string> {
    if (!this.isReady) await this.init();

    if (this.worker) {
      const hex = await new Promise<string>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data.id === this.id && e.data.type === 'digest') {
            this.worker?.removeEventListener('message', handler);
            resolve(e.data.hex);
          } else if (e.data.id === this.id && e.data.type === 'error') {
            this.worker?.removeEventListener('message', handler);
            reject(new Error(e.data.error));
          }
        };
        this.worker?.addEventListener('message', handler);
        this.worker?.postMessage({ type: 'digest', id: this.id });
      });
      this.worker.terminate();
      this.worker = null;
      return hex;
    }

    if (this.inlineHasher) {
      const hex = this.inlineHasher.digest();
      this.inlineHasher = null;
      return hex;
    }

    throw new Error('Hasher not initialized');
  }

  abort(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'abort', id: this.id });
      this.worker.terminate();
      this.worker = null;
    }
    this.inlineHasher = null;
  }
}

/**
 * Computes the SHA-256 hex digest of a File in streaming 4 MiB slices (TRD §11).
 */
export async function computeFileHash(
  file: File,
  sliceSize: number = SLICE_SIZE,
  onProgress?: (bytesProcessed: number, totalBytes: number) => void,
): Promise<string> {
  const hasher = new StreamHasher();
  await hasher.init();

  const total = file.size;
  let offset = 0;

  while (offset < total) {
    const end = Math.min(offset + sliceSize, total);
    const slice = file.slice(offset, end);
    const buf = await slice.arrayBuffer();
    await hasher.update(new Uint8Array(buf));
    offset = end;
    onProgress?.(offset, total);
  }

  return hasher.digest();
}

/**
 * Computes SHA-256 hex digest from an async iterable of byte chunks.
 */
export async function computeStreamHash(slices: AsyncIterable<Uint8Array>): Promise<string> {
  const hasher = new StreamHasher();
  await hasher.init();

  for await (const slice of slices) {
    await hasher.update(slice);
  }

  return hasher.digest();
}
