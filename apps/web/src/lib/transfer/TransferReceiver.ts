import {
  ACK_INTERVAL_CHUNKS,
  ACK_INTERVAL_MS,
  PROGRESS_THROTTLE_MS,
  type ControlMessage,
  type OfferMessage,
} from '@dropzone/protocol';
import { type ChunkWriter, MemoryWriter } from './MemoryWriter.js';
import type { TransferTransport } from './transport.js';
import { ChunkBitmap } from './bitmap.js';
import { computeStreamHash } from './hasher.js';
import {
  saveResumeRecord,
  deleteResumeRecord,
  type StorageBackendKind,
} from './resumeStore.js';
import { acquireWakeLock, releaseWakeLock } from './wakeLock.js';

export type ReceiverState = 'idle' | 'active' | 'verifying' | 'done' | 'cancelled' | 'error';

export interface TransferReceiverOptions {
  writerKind?: StorageBackendKind;
  onProgress?: (
    receivedBytes: number,
    totalBytes: number,
    speed: number,
    progress: number,
    etaSeconds: number | null,
  ) => void;
  onComplete?: (file: File | null, verified: boolean) => void;
  onError?: (error: Error) => void;
  onCancelled?: (reason?: string) => void;
}

/**
 * Reassembles incoming binary chunks via ChunkWriter, tracks bitmap, persists
 * partial state to IndexedDB for resume, and computes SHA-256 integrity verification (TRD §10.2, §11).
 */
export class TransferReceiver {
  public readonly transferId: number;
  public readonly offer: OfferMessage;
  private readonly transport: TransferTransport;
  private writer: ChunkWriter;
  private readonly options: TransferReceiverOptions;

  private state: ReceiverState = 'idle';
  private bytesReceived = 0;
  private bitmap: ChunkBitmap;
  private chunksSinceLastAck = 0;
  private lastAckTime = 0;
  private lastProgressEmit = 0;
  private sentAllReceived = false;
  private senderHash: string | null = null;
  private wakeLockAcquired = false;

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
    this.bitmap = ChunkBitmap.empty(offer.totalChunks);
  }

  getState(): ReceiverState {
    return this.state;
  }

  getBitmap(): ChunkBitmap {
    return this.bitmap;
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') return;
    try {
      try {
        await this.writer.open({
          name: this.offer.name,
          size: this.offer.size,
          mime: this.offer.mime,
          chunkSize: this.offer.chunkSize,
          totalChunks: this.offer.totalChunks,
        });
      } catch (openErr) {
        console.warn(`${this.options.writerKind ?? 'backend'} open failed; falling back to MemoryWriter:`, openErr);
        this.writer = new MemoryWriter();
        this.options.writerKind = 'memory';
        await this.writer.open({
          name: this.offer.name,
          size: this.offer.size,
          mime: this.offer.mime,
          chunkSize: this.offer.chunkSize,
          totalChunks: this.offer.totalChunks,
        });
      }

      this.state = 'active';
      this.lastAckTime = performance.now();
      this.lastSampleTime = performance.now();
      void this.ensureWakeLock();

      const sendAccept = () =>
        this.transport.sendControl({
          t: 'accept',
          transferId: this.transferId,
        });

      let sent = sendAccept();
      if (!sent) {
        for (let attempt = 0; attempt < 15 && !sent && this.state === 'active'; attempt++) {
          await new Promise((r) => setTimeout(r, 150));
          sent = sendAccept();
        }
      }

      if (!sent) {
        throw new Error('Failed to send accept message over control channel');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.fail(error);
    }
  }

  async handleChunk(chunkIndex: number, payload: Uint8Array): Promise<void> {
    if (this.state !== 'active') return;

    if (chunkIndex < 0 || chunkIndex >= this.offer.totalChunks) {
      await this.fail(
        new Error(`Chunk index ${chunkIndex} out of bounds (total: ${this.offer.totalChunks})`),
      );
      return;
    }

    try {
      const buf =
        payload.byteOffset === 0 && payload.byteLength === payload.buffer.byteLength
          ? (payload.buffer as ArrayBuffer)
          : (payload.buffer.slice(
              payload.byteOffset,
              payload.byteOffset + payload.byteLength,
            ) as ArrayBuffer);

      await this.writer.write(chunkIndex, buf);

      if (!this.bitmap.has(chunkIndex)) {
        this.bitmap.set(chunkIndex);
        this.bytesReceived += payload.byteLength;
        this.chunksSinceLastAck++;
      }

      const now = performance.now();
      if (
        this.chunksSinceLastAck >= ACK_INTERVAL_CHUNKS ||
        now - this.lastAckTime >= ACK_INTERVAL_MS
      ) {
        await this.sendAck(now);
      }

      this.updateProgress();

      if (this.sentAllReceived && this.bitmap.isComplete()) {
        await this.finalizeTransfer();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.fail(error);
    }
  }

  async handleControl(message: ControlMessage): Promise<void> {
    if ('transferId' in message && message.transferId !== this.transferId) return;

    switch (message.t) {
      case 'sent-all':
        this.sentAllReceived = true;
        if (this.bitmap.isComplete()) {
          await this.finalizeTransfer();
        }
        break;

      case 'hash':
        this.senderHash = message.hex;
        if (this.state === 'verifying') {
          await this.verifyIntegrity();
        }
        break;

      case 'cancel':
        this.cleanup();
        this.state = 'cancelled';
        await this.writer.abort();
        await deleteResumeRecord(this.transferId);
        this.options.onCancelled?.(message.reason);
        break;
    }
  }

  /**
   * Send resume request after a connection reconnection (TRD §10.4).
   */
  sendResume(): void {
    if (this.state === 'cancelled' || this.state === 'done') return;
    this.transport.sendControl({
      t: 'resume',
      transferId: this.transferId,
      bitmap: this.bitmap.toBase64(),
      received: this.bitmap.count(),
    });
  }

  async cancel(reason?: string): Promise<void> {
    if (this.state === 'done' || this.state === 'cancelled' || this.state === 'error') return;
    this.state = 'cancelled';
    this.cleanup();
    this.transport.sendControl({
      t: 'cancel',
      transferId: this.transferId,
      reason,
    });
    await this.writer.abort();
    await deleteResumeRecord(this.transferId);
    this.options.onCancelled?.(reason);
  }

  private async sendAck(now: number): Promise<void> {
    this.chunksSinceLastAck = 0;
    this.lastAckTime = now;
    await this.writer.flush();

    this.transport.sendControl({
      t: 'ack',
      transferId: this.transferId,
      received: this.bitmap.count(),
    });

    // Persist to IndexedDB for resume
    void saveResumeRecord({
      transferId: this.transferId,
      peerDeviceId: '',
      name: this.offer.name,
      size: this.offer.size,
      lastModified: this.offer.lastModified,
      chunkSize: this.offer.chunkSize,
      totalChunks: this.offer.totalChunks,
      bitmap: this.bitmap.toBase64(),
      received: this.bitmap.count(),
      writerKind: this.options.writerKind ?? 'memory',
      updatedAt: Date.now(),
    });
  }

  private async finalizeTransfer(): Promise<void> {
    if (this.state !== 'active') return;
    try {
      await this.sendAck(performance.now());
      await this.writer.finalize();
      this.state = 'verifying';
      this.emitProgress(true);

      // Verify SHA-256 hash if already received, or wait for 'hash' message
      if (this.senderHash) {
        await this.verifyIntegrity();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.fail(error);
    }
  }

  private async verifyIntegrity(): Promise<void> {
    try {
      const computedHash = await computeStreamHash(this.writer.readSlices(4 * 1024 * 1024));
      const ok = this.senderHash === null || computedHash === this.senderHash;

      this.transport.sendControl({
        t: 'verified',
        transferId: this.transferId,
        ok,
        hex: computedHash,
      });

      if (!ok) {
        throw new Error(
          `SHA-256 mismatch: sender=${this.senderHash}, receiver=${computedHash}`,
        );
      }

      this.state = 'done';
      this.cleanup();
      await deleteResumeRecord(this.transferId);

      const file =
        'getFile' in this.writer
          ? (this.writer as { getFile: () => File | null }).getFile()
          : null;
      this.options.onComplete?.(file, true);
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

  private async ensureWakeLock(): Promise<void> {
    if (!this.wakeLockAcquired) {
      this.wakeLockAcquired = true;
      await acquireWakeLock();
    }
  }

  private cleanup(): void {
    if (this.wakeLockAcquired) {
      this.wakeLockAcquired = false;
      void releaseWakeLock();
    }
  }

  private async fail(error: Error): Promise<void> {
    this.state = 'error';
    this.cleanup();
    this.transport.sendControl({
      t: 'cancel',
      transferId: this.transferId,
      reason: error.message,
    });
    try {
      await this.writer.abort();
      await deleteResumeRecord(this.transferId);
    } catch {
      // ignore
    }
    this.options.onError?.(error);
  }
}
