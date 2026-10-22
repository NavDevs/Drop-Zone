import {
  DEFAULT_CHUNK_SIZE,
  BUFFER_HIGH,
  ACK_WINDOW_BYTES,
  PROGRESS_THROTTLE_MS,
  encodeFrame,
  type ControlMessage,
} from '@dropzone/protocol';
import type { TransferTransport } from './transport.js';
import { PrefetchQueue } from './PrefetchQueue.js';
import { ChunkBitmap } from './bitmap.js';
import { computeFileHash } from './hasher.js';
import { acquireWakeLock, releaseWakeLock } from './wakeLock.js';

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
 * Sends a single file over WebRTC DataChannels with dual backpressure
 * (network bufferedAmount + 16 MiB receiver disk window), prefetch read-ahead,
 * concurrent SHA-256 calculation, and auto-resume support (TRD §10.1, §11).
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
  private ackWaiters: Array<() => void> = [];
  private lastProgressEmit = 0;

  // Flow control (TRD §10.1)
  private readonly windowChunks: number;
  private lastAckReceived = 0;
  private receivedAtPassStart = 0;
  private chunksSentThisPass = 0;

  // Integrity & queue
  private prefetchQueue: PrefetchQueue | null = null;
  private hashPromise: Promise<string> | null = null;
  private fileHash: string | null = null;
  private wakeLockAcquired = false;

  getFileHash(): string | null {
    return this.fileHash;
  }

  // EWMA speed tracking
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
    this.windowChunks = Math.max(1, Math.floor(ACK_WINDOW_BYTES / this.chunkSize));
  }

  getState(): SenderState {
    return this.state;
  }

  start(): void {
    if (this.state !== 'idle') return;
    this.state = 'offering';

    const sendOffer = () =>
      this.transport.sendControl({
        t: 'offer',
        transferId: this.transferId,
        name: this.file.name,
        size: this.file.size,
        mime: this.file.type || 'application/octet-stream',
        lastModified: this.file.lastModified,
        chunkSize: this.chunkSize,
        totalChunks: this.totalChunks,
        channels: Math.max(1, this.transport.dataChannelCount()),
      });

    let sent = sendOffer();
    if (!sent) {
      let attempts = 0;
      const retryTimer = setInterval(() => {
        attempts++;
        if (this.state !== 'offering') {
          clearInterval(retryTimer);
          return;
        }
        sent = sendOffer();
        if (sent || attempts >= 20) {
          clearInterval(retryTimer);
          if (!sent && this.state === 'offering') {
            this.fail(new Error('Failed to send offer over control channel'));
          }
        }
      }, 150);
    }
  }

  handleControl(message: ControlMessage): void {
    if ('transferId' in message && message.transferId !== this.transferId) return;

    switch (message.t) {
      case 'accept':
        if (this.state === 'offering' || this.state === 'paused') {
          this.beginTransferPass();
        }
        break;

      case 'ack':
        this.lastAckReceived = message.received;
        this.notifyAckWaiters();
        break;

      case 'resume': {
        const bitmap = ChunkBitmap.fromBase64(message.bitmap, this.totalChunks);
        const missing = bitmap.missingIndices();
        this.resumePass(missing, message.received);
        break;
      }

      case 'reject':
        this.cleanup();
        this.state = 'declined';
        this.options.onDeclined?.(message.reason);
        break;

      case 'cancel':
        this.cleanup();
        this.state = 'cancelled';
        if (this.resumeResolve) {
          this.resumeResolve();
          this.resumeResolve = null;
        }
        this.notifyAckWaiters();
        this.options.onCancelled?.(message.reason);
        break;

      case 'pause':
        this.pause();
        break;

      case 'continue':
        this.resume();
        break;

      case 'verified':
        if (this.state === 'done') {
          if (!message.ok) {
            this.options.onError?.(new Error('Remote peer reported hash verification failure'));
          }
        }
        break;
    }
  }

  private beginTransferPass(initialIndices?: number[]): void {
    this.state = 'active';
    void this.ensureWakeLock();

    // Start background hash calculation concurrently if not started yet (TRD §11)
    if (!this.hashPromise) {
      this.hashPromise = computeFileHash(this.file).then((hex) => {
        this.fileHash = hex;
        return hex;
      });
    }

    const indices = initialIndices ?? Array.from({ length: this.totalChunks }, (_, i) => i);
    this.receivedAtPassStart = this.totalChunks - indices.length;
    this.lastAckReceived = this.receivedAtPassStart;
    this.chunksSentThisPass = 0;

    if (!this.prefetchQueue) {
      this.prefetchQueue = new PrefetchQueue(this.file, this.chunkSize, indices);
    } else {
      this.prefetchQueue.reset(indices);
    }

    void this.runSendLoop();
  }

  private resumePass(missingIndices: number[], alreadyReceived: number): void {
    if (this.state === 'cancelled' || this.state === 'error') return;
    this.state = 'active';
    void this.ensureWakeLock();

    this.receivedAtPassStart = alreadyReceived;
    this.lastAckReceived = alreadyReceived;
    this.chunksSentThisPass = 0;

    if (this.prefetchQueue) {
      this.prefetchQueue.reset(missingIndices);
    } else {
      this.prefetchQueue = new PrefetchQueue(this.file, this.chunkSize, missingIndices);
    }

    if (this.resumeResolve) {
      this.resumeResolve();
      this.resumeResolve = null;
    }
    this.notifyAckWaiters();
    void this.runSendLoop();
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
    this.cleanup();
    this.transport.sendControl({ t: 'cancel', transferId: this.transferId, reason });
    if (this.resumeResolve) {
      this.resumeResolve();
      this.resumeResolve = null;
    }
    this.notifyAckWaiters();
    this.options.onCancelled?.(reason);
  }

  private async runSendLoop(): Promise<void> {
    const numChannels = Math.max(1, this.transport.dataChannelCount());
    this.lastSampleTime = performance.now();
    this.lastSampleBytes = this.bytesSent;

    try {
      while (this.state === 'active' && this.prefetchQueue) {
        while ((this.state as SenderState) === 'paused') {
          await new Promise<void>((resolve) => {
            this.resumeResolve = resolve;
          });
        }
        if (this.state !== 'active') break;

        // 1. Receiver-disk backpressure (TRD §10.1): wait if in-flight chunks reach window
        const inflight = this.chunksSentThisPass - (this.lastAckReceived - this.receivedAtPassStart);
        if (inflight >= this.windowChunks) {
          await new Promise<void>((resolve) => {
            let done = false;
            const onAck = () => {
              if (done) return;
              done = true;
              resolve();
            };
            this.ackWaiters.push(onAck);
            setTimeout(onAck, 800);
          });
          if (this.state !== 'active') break;
        }

        // 2. Fetch next chunk from bounded read-ahead prefetch queue
        const item = await this.prefetchQueue.take();
        if (!item) break; // Pass finished

        // 3. Network backpressure: check target channel buffer
        const channelIdx = item.index % numChannels;
        if (this.transport.getBufferedAmount(channelIdx) > BUFFER_HIGH) {
          await this.transport.whenBufferedAmountLow(channelIdx);
        }
        if (this.state !== 'active') break;

        // 4. Send binary chunk frame (TRD §9)
        const frame = encodeFrame(this.transferId, item.index, new Uint8Array(item.buffer));
        let sent = this.transport.sendData(frame, channelIdx);
        if (!sent) {
          // Transient backoff retry to prevent unexpected transfer aborts on momentary buffer spikes
          for (let attempt = 0; attempt < 20 && !sent && this.state === 'active'; attempt++) {
            await new Promise((r) => setTimeout(r, 100));
            sent = this.transport.sendData(frame, channelIdx);
          }
          if (!sent) {
            throw new Error(`DataChannel ${channelIdx} unavailable sending chunk ${item.index}`);
          }
        }

        this.chunksSentThisPass++;
        this.bytesSent += item.buffer.byteLength;
        this.updateProgress();
      }

      if (this.state === 'active') {
        this.emitProgress(true);
        this.transport.sendControl({ t: 'sent-all', transferId: this.transferId });

        // Await hash and transmit to receiver (TRD §11)
        if (this.hashPromise) {
          const hex = await this.hashPromise;
          this.transport.sendControl({
            t: 'hash',
            transferId: this.transferId,
            algo: 'sha256',
            hex,
          });
        }

        this.state = 'done';
        this.cleanup();
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

  private notifyAckWaiters(): void {
    const list = this.ackWaiters;
    this.ackWaiters = [];
    for (const resolve of list) resolve();
  }

  private async ensureWakeLock(): Promise<void> {
    if (!this.wakeLockAcquired) {
      this.wakeLockAcquired = true;
      await acquireWakeLock();
    }
  }

  private cleanup(): void {
    if (this.prefetchQueue) {
      this.prefetchQueue.abort();
      this.prefetchQueue = null;
    }
    if (this.wakeLockAcquired) {
      this.wakeLockAcquired = false;
      void releaseWakeLock();
    }
  }

  private fail(error: Error): void {
    this.state = 'error';
    this.cleanup();
    this.transport.sendControl({
      t: 'cancel',
      transferId: this.transferId,
      reason: error.message,
    });
    this.options.onError?.(error);
  }
}
