import {
  ACK_INTERVAL_CHUNKS,
  ACK_INTERVAL_MS,
  PROGRESS_THROTTLE_MS,
  type ControlMessage,
  type OfferMessage,
} from '@dropzone/protocol';
import type { ChunkWriter } from './MemoryWriter.js';
import type { TransferTransport } from './transport.js';

export type ReceiverState = 'idle' | 'active' | 'done' | 'cancelled' | 'error';

export interface TransferReceiverOptions {
  onProgress?: (
    receivedBytes: number,
    totalBytes: number,
    speed: number,
    progress: number,
    etaSeconds: number | null,
  ) => void;
  onComplete?: (file: File | null) => void;
  onError?: (error: Error) => void;
  onCancelled?: (reason?: string) => void;
}

/**
 * Reassembles incoming chunks via a ChunkWriter, emits throttled progress,
 * and sends periodic acks for backpressure (TRD §10.2).
 */
export class TransferReceiver {
  public readonly transferId: number;
  public readonly offer: OfferMessage;
  private readonly transport: TransferTransport;
  private readonly writer: ChunkWriter;
  private readonly options: TransferReceiverOptions;

  private state: ReceiverState = 'idle';
  private bytesReceived = 0;
  private receivedChunkIndices = new Set<number>();
  private chunksSinceLastAck = 0;
  private lastAckTime = 0;
  private lastProgressEmit = 0;
  private sentAllReceived = false;

  // EWMA speed tracking
  private speedEwma = 0;
  private lastSampleTime = 0;
  private lastSampleBytes = 0;

  constructor(
    offer: OfferMessage,
    transport: TransferTransport,
    writer: ChunkWriter,
    options: TransferReceiverOptions = {},
  ) {
    this.offer = offer;
    this.transferId = offer.transferId;
    this.transport = transport;
    this.writer = writer;
    this.options = options;
  }

  getState(): ReceiverState {
    return this.state;
  }

  /** Open the writer and accept the transfer (TRD §10.2). */
  async start(): Promise<void> {
    if (this.state !== 'idle') return;
    try {
      await this.writer.open({
        name: this.offer.name,
        size: this.offer.size,
        mime: this.offer.mime,
        chunkSize: this.offer.chunkSize,
        totalChunks: this.offer.totalChunks,
      });

      this.state = 'active';
      this.lastAckTime = performance.now();
      this.lastSampleTime = performance.now();

      const sent = this.transport.sendControl({
        t: 'accept',
        transferId: this.transferId,
      });

      if (!sent) {
        throw new Error('Failed to send accept message over control channel');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.fail(error);
    }
  }

  /** Write an incoming binary chunk into the storage backend. */
  async handleChunk(chunkIndex: number, payload: Uint8Array): Promise<void> {
    if (this.state !== 'active') return;

    if (chunkIndex < 0 || chunkIndex >= this.offer.totalChunks) {
      await this.fail(
        new Error(`Chunk index ${chunkIndex} out of bounds (total: ${this.offer.totalChunks})`),
      );
      return;
    }

    try {
      // Positional write into storage backend
      const buf =
        payload.byteOffset === 0 && payload.byteLength === payload.buffer.byteLength
          ? (payload.buffer as ArrayBuffer)
          : (payload.buffer.slice(
              payload.byteOffset,
              payload.byteOffset + payload.byteLength,
            ) as ArrayBuffer);
      await this.writer.write(chunkIndex, buf);

      if (!this.receivedChunkIndices.has(chunkIndex)) {
        this.receivedChunkIndices.add(chunkIndex);
        this.bytesReceived += payload.byteLength;
        this.chunksSinceLastAck++;
      }

      // Backpressure ack check: every 64 chunks or 250ms (TRD §10.2)
      const now = performance.now();
      if (
        this.chunksSinceLastAck >= ACK_INTERVAL_CHUNKS ||
        now - this.lastAckTime >= ACK_INTERVAL_MS
      ) {
        await this.sendAck(now);
      }

      this.updateProgress();

      // Check if sent-all was already waiting on the last chunk
      if (
        this.sentAllReceived &&
        this.receivedChunkIndices.size === this.offer.totalChunks
      ) {
        await this.finalizeTransfer();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.fail(error);
    }
  }

  /** Process control messages (sent-all, cancel) for this transfer. */
  async handleControl(message: ControlMessage): Promise<void> {
    if ('transferId' in message && message.transferId !== this.transferId) return;

    switch (message.t) {
      case 'sent-all':
        this.sentAllReceived = true;
        if (this.receivedChunkIndices.size === this.offer.totalChunks) {
          await this.finalizeTransfer();
        }
        break;

      case 'cancel':
        this.state = 'cancelled';
        await this.writer.abort();
        this.options.onCancelled?.(message.reason);
        break;
    }
  }

  async cancel(reason?: string): Promise<void> {
    if (this.state === 'done' || this.state === 'cancelled' || this.state === 'error') return;
    this.state = 'cancelled';
    this.transport.sendControl({
      t: 'cancel',
      transferId: this.transferId,
      reason,
    });
    await this.writer.abort();
    this.options.onCancelled?.(reason);
  }

  private async sendAck(now: number): Promise<void> {
    this.chunksSinceLastAck = 0;
    this.lastAckTime = now;
    await this.writer.flush();
    this.transport.sendControl({
      t: 'ack',
      transferId: this.transferId,
      received: this.receivedChunkIndices.size,
    });
  }

  private async finalizeTransfer(): Promise<void> {
    if (this.state !== 'active') return;
    try {
      await this.sendAck(performance.now());
      await this.writer.finalize();
      this.state = 'done';
      this.emitProgress(true);

      const file = 'getFile' in this.writer ? (this.writer as { getFile: () => File | null }).getFile() : null;
      this.options.onComplete?.(file);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.fail(error);
    }
  }

  private updateProgress(): void {
    const now = performance.now();
    if (now - this.lastProgressEmit < PROGRESS_THROTTLE_MS) return;

    const timeDelta = (now - this.lastSampleTime) / 1000;
    if (timeDelta >= 0.5) {
      const bytesDelta = this.bytesReceived - this.lastSampleBytes;
      const currentSpeed = bytesDelta / timeDelta;
      this.speedEwma = this.speedEwma === 0 ? currentSpeed : 0.3 * currentSpeed + 0.7 * this.speedEwma;
      this.lastSampleTime = now;
      this.lastSampleBytes = this.bytesReceived;
    }

    this.emitProgress(false);
  }

  private emitProgress(isFinal: boolean): void {
    this.lastProgressEmit = performance.now();
    const progress = this.offer.size > 0 ? Math.min(1, this.bytesReceived / this.offer.size) : 1;
    const remainingBytes = Math.max(0, this.offer.size - this.bytesReceived);
    const eta = !isFinal && this.speedEwma > 0 ? remainingBytes / this.speedEwma : null;

    this.options.onProgress?.(
      this.bytesReceived,
      this.offer.size,
      this.speedEwma,
      isFinal ? 1 : progress,
      isFinal ? 0 : eta,
    );
  }

  private async fail(error: Error): Promise<void> {
    this.state = 'error';
    this.transport.sendControl({
      t: 'cancel',
      transferId: this.transferId,
      reason: error.message,
    });
    try {
      await this.writer.abort();
    } catch {
      // ignore writer abort errors on failure path
    }
    this.options.onError?.(error);
  }
}
