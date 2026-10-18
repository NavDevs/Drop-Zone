import {
  DEFAULT_CHUNK_SIZE,
  BUFFER_HIGH,
  PROGRESS_THROTTLE_MS,
  encodeFrame,
  type ControlMessage,
} from '@dropzone/protocol';
import type { TransferTransport } from './transport.js';

export type SenderState =
  | 'idle'
  | 'offering'
  | 'active'
  | 'paused'
  | 'done'
  | 'declined'
  | 'cancelled'
  | 'error';

export interface TransferSenderOptions {
  chunkSize?: number;
  onProgress?: (
    transferred: number,
    total: number,
    speed: number,
    progress: number,
    etaSeconds: number | null,
  ) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onDeclined?: (reason: string) => void;
  onCancelled?: (reason?: string) => void;
}

/**
 * Sends a single file over the WebRTC DataChannels with network backpressure,
 * chunking, EWMA speed tracking, and throttled UI updates (TRD §10.1).
 */
export class TransferSender {
  public readonly transferId: number;
  public readonly file: File;
  public readonly totalChunks: number;
  public readonly chunkSize: number;
  private readonly transport: TransferTransport;
  private readonly options: TransferSenderOptions;

  private state: SenderState = 'idle';
  private bytesSent = 0;
  private resumeResolve: (() => void) | null = null;
  private lastProgressEmit = 0;

  // EWMA speed tracking (alpha = 0.3 for responsive yet smooth readings)
  private speedEwma = 0;
  private lastSampleTime = 0;
  private lastSampleBytes = 0;

  constructor(
    transferId: number,
    file: File,
    transport: TransferTransport,
    options: TransferSenderOptions = {},
  ) {
    this.transferId = transferId;
    this.file = file;
    this.transport = transport;
    this.options = options;

    const remoteMax = transport.getRemoteMaxMessageSize();
    const effectiveMax = remoteMax && remoteMax > 0 ? remoteMax : DEFAULT_CHUNK_SIZE;
    this.chunkSize = Math.min(options.chunkSize ?? DEFAULT_CHUNK_SIZE, effectiveMax);
    this.totalChunks = Math.max(1, Math.ceil(file.size / this.chunkSize));
  }

  getState(): SenderState {
    return this.state;
  }

  /** Send the offer message to initiate transfer (TRD §8). */
  start(): void {
    if (this.state !== 'idle') return;
    this.state = 'offering';

    const sent = this.transport.sendControl({
      t: 'offer',
      transferId: this.transferId,
      name: this.file.name,
      size: this.file.size,
      mime: this.file.type || 'application/octet-stream',
      lastModified: this.file.lastModified,
      chunkSize: this.chunkSize,
      totalChunks: this.totalChunks,
      channels: 1,
    });

    if (!sent) {
      this.fail(new Error('Failed to send offer over control channel'));
    }
  }

  /** Process incoming control message for this transfer. */
  handleControl(message: ControlMessage): void {
    if ('transferId' in message && message.transferId !== this.transferId) return;

    switch (message.t) {
      case 'accept':
        if (this.state === 'offering') {
          this.state = 'active';
          void this.runSendLoop();
        }
        break;

      case 'reject':
        this.state = 'declined';
        this.options.onDeclined?.(message.reason);
        break;

      case 'cancel':
        this.state = 'cancelled';
        if (this.resumeResolve) {
          this.resumeResolve();
          this.resumeResolve = null;
        }
        this.options.onCancelled?.(message.reason);
        break;

      case 'pause':
        this.pause();
        break;

      case 'continue':
        this.resume();
        break;
    }
  }

  pause(): void {
    if (this.state === 'active') {
      this.state = 'paused';
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'active';
      if (this.resumeResolve) {
        this.resumeResolve();
        this.resumeResolve = null;
      }
    }
  }

  cancel(reason?: string): void {
    if (this.state === 'done' || this.state === 'cancelled' || this.state === 'error') return;
    this.state = 'cancelled';
    this.transport.sendControl({ t: 'cancel', transferId: this.transferId, reason });
    if (this.resumeResolve) {
      this.resumeResolve();
      this.resumeResolve = null;
    }
    this.options.onCancelled?.(reason);
  }

  private async runSendLoop(): Promise<void> {
    const now = performance.now();
    this.lastSampleTime = now;
    this.lastSampleBytes = 0;

    try {
      for (let i = 0; i < this.totalChunks; i++) {
        // Handle pause
        while (this.state === 'paused') {
          await new Promise<void>((resolve) => {
            this.resumeResolve = resolve;
          });
        }

        if (this.state !== 'active') break;

        // Network backpressure: yield if channel buffer is deep (TRD §10.1)
        if (this.transport.getBufferedAmount(0) > BUFFER_HIGH) {
          await this.transport.whenBufferedAmountLow(0);
        }

        if (this.state !== 'active') break;

        // Slice chunk and read array buffer
        const start = i * this.chunkSize;
        const end = Math.min(start + this.chunkSize, this.file.size);
        const slice = this.file.slice(start, end);
        const buf = await slice.arrayBuffer();

        // Encode and send binary frame (TRD §9)
        const frame = encodeFrame(this.transferId, i, new Uint8Array(buf));
        const sent = this.transport.sendData(frame, 0);
        if (!sent) {
          throw new Error(`DataChannel closed or unavailable sending chunk ${i}`);
        }

        this.bytesSent += buf.byteLength;
        this.updateProgress();
      }

      if (this.state === 'active') {
        // Send final progress 100%
        this.emitProgress(true);

        // Notify receiver that all chunks have been transmitted
        this.transport.sendControl({ t: 'sent-all', transferId: this.transferId });
        this.state = 'done';
        this.options.onComplete?.();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.fail(error);
    }
  }

  private updateProgress(): void {
    const now = performance.now();
    if (now - this.lastProgressEmit < PROGRESS_THROTTLE_MS) return;

    const timeDelta = (now - this.lastSampleTime) / 1000;
    if (timeDelta >= 0.5) {
      const bytesDelta = this.bytesSent - this.lastSampleBytes;
      const currentSpeed = bytesDelta / timeDelta;
      this.speedEwma = this.speedEwma === 0 ? currentSpeed : 0.3 * currentSpeed + 0.7 * this.speedEwma;
      this.lastSampleTime = now;
      this.lastSampleBytes = this.bytesSent;
    }

    this.emitProgress(false);
  }

  private emitProgress(isFinal: boolean): void {
    this.lastProgressEmit = performance.now();
    const progress = this.file.size > 0 ? Math.min(1, this.bytesSent / this.file.size) : 1;
    const remainingBytes = Math.max(0, this.file.size - this.bytesSent);
    const eta = !isFinal && this.speedEwma > 0 ? remainingBytes / this.speedEwma : null;

    this.options.onProgress?.(
      this.bytesSent,
      this.file.size,
      this.speedEwma,
      isFinal ? 1 : progress,
      isFinal ? 0 : eta,
    );
  }

  private fail(error: Error): void {
    this.state = 'error';
    this.transport.sendControl({
      t: 'cancel',
      transferId: this.transferId,
      reason: error.message,
    });
    this.options.onError?.(error);
  }
}
