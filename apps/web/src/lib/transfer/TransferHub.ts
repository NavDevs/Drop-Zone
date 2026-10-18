import {
  type ControlMessage,
  type OfferMessage,
} from '@dropzone/protocol';
import { getPeerManager, type PeerManager } from '../rtc/PeerManager.js';
import { useTransfersStore } from '../../state/transfersStore.js';
import { usePeersStore } from '../../state/peersStore.js';
import { sanitizeFileName, isDangerousExtension } from './sanitize.js';
import { MemoryWriter } from './MemoryWriter.js';
import { TransferSender } from './TransferSender.js';
import { TransferReceiver } from './TransferReceiver.js';

export interface IncomingOffer {
  transferId: number;
  fromDeviceId: string;
  senderName: string;
  name: string;
  size: number;
  mime: string;
  dangerous: boolean;
  receivedAt: number;
}

/**
 * Coordinates file transfers across WebRTC peer sessions and synchronizes
 * active transfer records with useTransfersStore (TRD §10).
 */
export class TransferHub {
  private readonly peerManager: PeerManager;
  private readonly senders = new Map<number, TransferSender>();
  private readonly receivers = new Map<number, TransferReceiver>();
  private readonly incomingOffers = new Map<number, IncomingOffer>();
  private readonly offerListeners = new Set<(offers: IncomingOffer[]) => void>();
  private readonly downloadUrls = new Map<number, string>();

  private unsubControl: (() => void) | null = null;
  private unsubChunk: (() => void) | null = null;
  private unsubRemoved: (() => void) | null = null;

  constructor(peerManager: PeerManager = getPeerManager()) {
    this.peerManager = peerManager;
    this.bindPeerManager();
  }

  private bindPeerManager(): void {
    this.unsubControl = this.peerManager.subscribeControl((deviceId, message) => {
      this.handleControlMessage(deviceId, message);
    });

    this.unsubChunk = this.peerManager.subscribeChunk((_deviceId, transferId, chunkIndex, payload) => {
      const receiver = this.receivers.get(transferId);
      if (receiver) {
        void receiver.handleChunk(chunkIndex, payload);
      }
    });

    this.unsubRemoved = this.peerManager.subscribeSessionRemoved((deviceId) => {
      this.handleSessionRemoved(deviceId);
    });
  }

  destroy(): void {
    this.unsubControl?.();
    this.unsubChunk?.();
    this.unsubRemoved?.();

    for (const sender of this.senders.values()) sender.cancel('Hub destroyed');
    for (const receiver of this.receivers.values()) void receiver.cancel('Hub destroyed');

    for (const url of this.downloadUrls.values()) URL.revokeObjectURL(url);
    this.senders.clear();
    this.receivers.clear();
    this.incomingOffers.clear();
    this.downloadUrls.clear();
    this.offerListeners.clear();
  }

  subscribeIncomingOffers(listener: (offers: IncomingOffer[]) => void): () => void {
    this.offerListeners.add(listener);
    listener(Array.from(this.incomingOffers.values()));
    return () => this.offerListeners.delete(listener);
  }

  getIncomingOffers(): IncomingOffer[] {
    return Array.from(this.incomingOffers.values());
  }

  /**
   * Queue and initiate sending one or more files to a remote peer (FR-10).
   * Ensures peer session is established and launches TransferSender per file.
   */
  async sendFiles(remoteDeviceId: string, files: File[]): Promise<number[]> {
    this.peerManager.ensureSession(remoteDeviceId);
    const transport = this.peerManager.getTransport(remoteDeviceId);
    if (!transport) {
      throw new Error(`No transport available for peer ${remoteDeviceId}`);
    }

    const transferIds: number[] = [];

    for (const file of files) {
      const transferId = this.generateTransferId();
      transferIds.push(transferId);

      useTransfersStore.getState().add({
        id: transferId,
        peerId: remoteDeviceId,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        direction: 'send',
        status: 'offering',
        progress: 0,
        transferred: 0,
        speed: 0,
        startedAt: Date.now(),
      });

      const sender = new TransferSender(transferId, file, transport, {
        onProgress: (transferred, _total, speed, progress, eta) => {
          useTransfersStore.getState().update(transferId, {
            status: 'active',
            transferred,
            speed,
            progress,
            eta,
          });
        },
        onComplete: () => {
          useTransfersStore.getState().update(transferId, {
            status: 'done',
            progress: 1,
            speed: 0,
            eta: 0,
          });
          this.senders.delete(transferId);
        },
        onError: (err) => {
          useTransfersStore.getState().update(transferId, {
            status: 'error',
            error: err.message,
            speed: 0,
          });
          this.senders.delete(transferId);
        },
        onDeclined: (reason) => {
          useTransfersStore.getState().update(transferId, {
            status: 'declined',
            error: `Declined: ${reason}`,
            speed: 0,
          });
          this.senders.delete(transferId);
        },
        onCancelled: (reason) => {
          useTransfersStore.getState().update(transferId, {
            status: 'cancelled',
            error: reason ?? 'Cancelled',
            speed: 0,
          });
          this.senders.delete(transferId);
        },
      });

      this.senders.set(transferId, sender);
      sender.start();
    }

    return transferIds;
  }

  /**
   * Accept an incoming transfer offer (FR-11).
   * Nothing is written to disk before user clicks Accept.
   */
  async acceptOffer(transferId: number): Promise<void> {
    const item = this.incomingOffers.get(transferId);
    if (!item) return;

    this.incomingOffers.delete(transferId);
    this.notifyOfferListeners();

    const transport = this.peerManager.getTransport(item.fromDeviceId);
    if (!transport) {
      useTransfersStore.getState().update(transferId, {
        status: 'error',
        error: 'Peer disconnected before transfer could start',
      });
      return;
    }

    const offer: OfferMessage = {
      t: 'offer',
      transferId,
      name: item.name,
      size: item.size,
      mime: item.mime,
      lastModified: Date.now(),
      chunkSize: 16384,
      totalChunks: Math.max(1, Math.ceil(item.size / 16384)),
      channels: 1,
    };

    const writer = new MemoryWriter();
    const receiver = new TransferReceiver(offer, transport, writer, {
      onProgress: (receivedBytes, _total, speed, progress, eta) => {
        useTransfersStore.getState().update(transferId, {
          status: 'active',
          transferred: receivedBytes,
          speed,
          progress,
          eta,
        });
      },
      onComplete: (file) => {
        let downloadUrl: string | undefined;
        if (file) {
          downloadUrl = URL.createObjectURL(file);
          this.downloadUrls.set(transferId, downloadUrl);
        }
        useTransfersStore.getState().update(transferId, {
          status: 'done',
          progress: 1,
          speed: 0,
          eta: 0,
          downloadUrl,
        });
        this.receivers.delete(transferId);
      },
      onError: (err) => {
        useTransfersStore.getState().update(transferId, {
          status: 'error',
          error: err.message,
          speed: 0,
        });
        this.receivers.delete(transferId);
      },
      onCancelled: (reason) => {
        useTransfersStore.getState().update(transferId, {
          status: 'cancelled',
          error: reason ?? 'Cancelled',
          speed: 0,
        });
        this.receivers.delete(transferId);
      },
    });

    this.receivers.set(transferId, receiver);
    await receiver.start();
  }

  /** Decline an incoming offer (FR-11). */
  declineOffer(transferId: number, reason: 'declined' | 'no-space' | 'too-large' | 'busy' = 'declined'): void {
    const item = this.incomingOffers.get(transferId);
    if (!item) return;

    this.incomingOffers.delete(transferId);
    this.notifyOfferListeners();

    const transport = this.peerManager.getTransport(item.fromDeviceId);
    transport?.sendControl({
      t: 'reject',
      transferId,
      reason,
    });

    useTransfersStore.getState().update(transferId, {
      status: 'declined',
      error: 'Declined by user',
    });
  }

  /** Cancel an active or queued transfer (FR-16). */
  cancelTransfer(transferId: number): void {
    const sender = this.senders.get(transferId);
    if (sender) {
      sender.cancel('User cancelled');
      return;
    }

    const receiver = this.receivers.get(transferId);
    if (receiver) {
      void receiver.cancel('User cancelled');
      return;
    }

    if (this.incomingOffers.has(transferId)) {
      this.declineOffer(transferId, 'declined');
    }
  }

  getDownloadUrl(transferId: number): string | null {
    return this.downloadUrls.get(transferId) ?? null;
  }

  private handleControlMessage(fromDeviceId: string, message: ControlMessage): void {
    if (message.t === 'offer') {
      const sanitizedName = sanitizeFileName(message.name);
      const dangerous = isDangerousExtension(sanitizedName);
      const peer = usePeersStore.getState().peers[fromDeviceId];
      const senderName = peer?.device.name ?? fromDeviceId.slice(0, 8);

      const offerItem: IncomingOffer = {
        transferId: message.transferId,
        fromDeviceId,
        senderName,
        name: sanitizedName,
        size: message.size,
        mime: message.mime,
        dangerous,
        receivedAt: Date.now(),
      };

      this.incomingOffers.set(message.transferId, offerItem);

      useTransfersStore.getState().add({
        id: message.transferId,
        peerId: fromDeviceId,
        name: sanitizedName,
        size: message.size,
        mime: message.mime,
        direction: 'receive',
        status: 'offering',
        progress: 0,
        transferred: 0,
        speed: 0,
        startedAt: Date.now(),
      });

      this.notifyOfferListeners();
      return;
    }

    if ('transferId' in message && typeof message.transferId === 'number') {
      const sender = this.senders.get(message.transferId);
      if (sender) {
        sender.handleControl(message);
        return;
      }

      const receiver = this.receivers.get(message.transferId);
      if (receiver) {
        void receiver.handleControl(message);
        return;
      }
    }
  }

  private handleSessionRemoved(deviceId: string): void {
    for (const [id, offer] of this.incomingOffers.entries()) {
      if (offer.fromDeviceId === deviceId) {
        this.incomingOffers.delete(id);
        useTransfersStore.getState().update(id, {
          status: 'error',
          error: 'Peer disconnected',
        });
      }
    }
    this.notifyOfferListeners();

    for (const [id, sender] of this.senders.entries()) {
      const record = useTransfersStore.getState().transfers[id];
      if (record?.peerId === deviceId) {
        sender.cancel('Peer disconnected');
      }
    }

    for (const [id, receiver] of this.receivers.entries()) {
      const record = useTransfersStore.getState().transfers[id];
      if (record?.peerId === deviceId) {
        void receiver.cancel('Peer disconnected');
      }
    }
  }

  private notifyOfferListeners(): void {
    const list = Array.from(this.incomingOffers.values());
    for (const listener of this.offerListeners) {
      listener(list);
    }
  }

  private generateTransferId(): number {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return (array[0] ?? 1) || 1;
  }
}

let hubInstance: TransferHub | null = null;

export function getTransferHub(): TransferHub {
  if (!hubInstance) {
    hubInstance = new TransferHub();
  }
  return hubInstance;
}
