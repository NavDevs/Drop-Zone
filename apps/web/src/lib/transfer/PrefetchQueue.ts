import { PREFETCH_QUEUE_SIZE } from '@dropzone/protocol';

export interface PrefetchedChunk {
  index: number;
  buffer: ArrayBuffer;
}

/**
 * Bounded read-ahead queue for file chunks (TRD §10.1).
 * Pre-reads up to 8 chunks using file.slice() in the background so disk reads
 * do not stall the WebRTC DataChannel send loop.
 */
export class PrefetchQueue {
  private readonly file: File;
  private readonly chunkSize: number;
  private readonly maxQueueSize: number;

  private indicesToRead: number[] = [];
  private queue: PrefetchedChunk[] = [];
  private waiters: Array<() => void> = [];
  private reading = false;
  private aborted = false;
  private generation = 0;

  constructor(
    file: File,
    chunkSize: number,
    indices: number[],
    maxQueueSize: number = PREFETCH_QUEUE_SIZE,
  ) {
    this.file = file;
    this.chunkSize = chunkSize;
    this.indicesToRead = [...indices];
    this.maxQueueSize = maxQueueSize;
    void this.fill();
  }

  reset(indices: number[]): void {
    this.generation++;
    this.indicesToRead = [...indices];
    this.queue = [];
    this.aborted = false;
    this.notifyWaiters();
    void this.fill();
  }

  async take(): Promise<PrefetchedChunk | null> {
    while (!this.aborted) {
      if (this.queue.length > 0) {
        const item = this.queue.shift()!;
        void this.fill();
        return item;
      }

      if (this.indicesToRead.length === 0 && !this.reading) {
        return null;
      }

      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }

    return null;
  }

  abort(): void {
    this.aborted = true;
    this.generation++;
    this.indicesToRead = [];
    this.queue = [];
    this.notifyWaiters();
  }

  private async fill(): Promise<void> {
    if (this.reading || this.aborted) return;
    this.reading = true;

    try {
      while (!this.aborted) {
        if (this.queue.length >= this.maxQueueSize || this.indicesToRead.length === 0) {
          break;
        }

        const currentGen = this.generation;
        const index = this.indicesToRead.shift()!;
        const start = index * this.chunkSize;
        const end = Math.min(start + this.chunkSize, this.file.size);
        const slice = this.file.slice(start, end);
        const buffer = await slice.arrayBuffer();

        if (this.aborted) break;
        if (this.generation !== currentGen) {
          // Reset occurred while reading this slice; discard and continue with new indices
          continue;
        }

        this.queue.push({ index, buffer });
        this.notifyWaiters();
      }
    } finally {
      this.reading = false;
      if (
        !this.aborted &&
        this.queue.length < this.maxQueueSize &&
        this.indicesToRead.length > 0
      ) {
        void this.fill();
      }
    }
  }

  private notifyWaiters(): void {
    const list = this.waiters;
    this.waiters = [];
    for (const resolve of list) {
      resolve();
    }
  }
}
