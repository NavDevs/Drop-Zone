import {
  type ControlMessage,
  type OfferMessage,
} from '@dropzone/protocol';
import { getPeerManager, type PeerManager } from '../rtc/PeerManager.js';
import { useTransfersStore, type TransferRecord } from '../../state/transfersStore.js';
import { usePeersStore } from '../../state/peersStore.js';
import { sanitizeFileName, isDangerousExtension } from './sanitize.js';
import { type ChunkWriter, MemoryWriter } from './MemoryWriter.js';
import { FsAccessWriter } from './FsAccessWriter.js';
import { OpfsWriter } from './OpfsWriter.js';
import { selectStorageBackend, checkStorageEstimate } from './capability.js';
import { TransferSender } from './TransferSender.js';
import { TransferReceiver } from './TransferReceiver.js';
import { saveRoomHistoryRecord } from './resumeStore.js';

export interface IncomingOffer {
  transferId: number;
  fromDeviceId: string;
  senderName: string;
  name: string;
  size: number;
  mime: string;
  dangerous: boolean;
  receivedAt: number;
  lowSpaceWarning?: boolean;
}

declare global {
  interface Window {
    __dropzone?: {
      dropConnection: (peerId: string) => void;
      getTransferState: () => Record<number, TransferRecord>;
      resumeTransfer: (transferId: number) => void;
    };
  }
}

/**
 * Coordinates file transfers across WebRTC peer sessions, manages storage backends,
 * synchronizes with useTransfersStore, and provides test hooks (TRD §10, §14).
 */
export class TransferHub {
  private readonly peerManager: PeerManager;
  private readonly senders = new Map<number, TransferSender>();
  private readonly receivers = new Map<number, TransferReceiver>();
  private readonly incomingOffers = new Map<number, IncomingOffer>();
  private readonly offerListeners = new Set<(offers: IncomingOffer[]) => void>();
  private readonly downloadUrls = new Map<number, string>();
  private readonly sharedFiles = new Map<string, File>();
  private currentRoomCode: string | null = null;

  private unsubControl: (() => void) | null = null;
  private unsubChunk: (() => void) | null = null;
  private unsubRemoved: (() => void) | null = null;
  private unsubReady: (() => void) | null = null;

  constructor(peerManager: PeerManager = getPeerManager()) {
    this.peerManager = peerManager;
    this.bindPeerManager();
    this.exposeTestHooks();
  }

  setRoomCode(code: string | null): void {
    this.currentRoomCode = code;
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

    this.unsubReady = this.peerManager.subscribeReady((deviceId) => {
      this.handlePeerReady(deviceId);
    });
  }

  private exposeTestHooks(): void {
    if (typeof window !== 'undefined') {
      window.__dropzone = {
        dropConnection: (peerId: string) => {
          this.peerManager.removeSession(peerId);
        },
        getTransferState: () => {
          return useTransfersStore.getState().transfers;
        },
        resumeTransfer: (transferId: number) => {
          const receiver = this.receivers.get(transferId);
          if (receiver) receiver.sendResume();
        },
      };
    }
  }

  destroy(): void {
    this.unsubControl?.();
    this.unsubChunk?.();
    this.unsubRemoved?.();
    this.unsubReady?.();

    for (const sender of this.senders.values()) sender.cancel('Hub destroyed');
    for (const receiver of this.receivers.values()) void receiver.cancel('Hub destroyed');

    for (const url of this.downloadUrls.values()) URL.revokeObjectURL(url);
    this.senders.clear();
    this.receivers.clear();
    this.incomingOffers.clear();
    this.downloadUrls.clear();
    this.sharedFiles.clear();
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
   */
  async sendFiles(remoteDeviceId: string, files: File[]): Promise<number[]> {
    this.peerManager.ensureSession(remoteDeviceId);
    const transport = this.peerManager.getTransport(remoteDeviceId);
    if (!transport) {
      throw new Error(`No transport available for peer ${remoteDeviceId}`);
    }

    const transferIds: number[] = [];

    for (const file of files) {
      this.sharedFiles.set(`${file.name}-${file.size}`, file);
      const transferId = this.generateTransferId();
      transferIds.push(transferId);

      const record: TransferRecord = {
        id: transferId,
        peerId: remoteDeviceId,
        roomCode: this.currentRoomCode ?? '',
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        direction: 'send',
        status: 'offering',
        progress: 0,
        transferred: 0,
        speed: 0,
        startedAt: Date.now(),
      };
      useTransfersStore.getState().add(record);

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
            verified: true,
          });
          const rec = useTransfersStore.getState().transfers[transferId];
          if (rec) void saveRoomHistoryRecord({ ...rec, roomCode: this.currentRoomCode ?? '' });
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
   * Storage backend is selected and initialized upon explicit user Accept.
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

    const backendKind = selectStorageBackend(item.size);
    let writer: ChunkWriter;

    if (backendKind === 'fs-access') {
      writer = new FsAccessWriter();
    } else if (backendKind === 'opfs') {
      writer = new OpfsWriter(transferId);
    } else {
      writer = new MemoryWriter();
    }

    const receiver = new TransferReceiver(offer, transport, writer, {
      writerKind: backendKind,
      onProgress: (receivedBytes, _total, speed, progress, eta) => {
        useTransfersStore.getState().update(transferId, {
          status: 'active',
          transferred: receivedBytes,
          speed,
          progress,
          eta,
        });
      },
      onComplete: (file, verified) => {
        let downloadUrl: string | undefined;
        if (file) {
          downloadUrl = URL.createObjectURL(file);
          this.downloadUrls.set(transferId, downloadUrl);
          this.sharedFiles.set(`${item.name}-${item.size}`, file);
        }
        useTransfersStore.getState().update(transferId, {
          status: 'done',
          progress: 1,
          speed: 0,
          eta: 0,
          verified,
          downloadUrl,
          backend: backendKind,
        });
        const rec = useTransfersStore.getState().transfers[transferId];
        if (rec) void saveRoomHistoryRecord({ ...rec, roomCode: this.currentRoomCode ?? '' });
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
        senderName,
        roomCode: this.currentRoomCode ?? '',
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

      // Check available disk space (TRD §10.2)
      void checkStorageEstimate(message.size).then((estimate) => {
        if (!estimate.sufficient) {
          const current = this.incomingOffers.get(message.transferId);
          if (current) {
            current.lowSpaceWarning = true;
            this.notifyOfferListeners();
          }
        }
      });
      return;
    }

    if (message.t === 'text') {
      try {
        const data = JSON.parse(message.text) as {
          type?: string;
          roomCode?: string;
          records?: TransferRecord[];
          name?: string;
          size?: number;
        };
        if (data.type === 'dz:history-sync' && Array.isArray(data.records)) {
          const store = useTransfersStore.getState();
          for (const item of data.records) {
            if (!store.transfers[item.id]) {
              const fullRecord: TransferRecord = {
                ...item,
                roomCode: this.currentRoomCode ?? item.roomCode ?? '',
              };
              store.add(fullRecord);
              void saveRoomHistoryRecord(fullRecord);
            }
          }
          return;
        }
        if (data.type === 'dz:request-file' && data.name && typeof data.size === 'number') {
          const key = `${data.name}-${data.size}`;
          const file = this.sharedFiles.get(key);
          if (file) {
            void this.sendFiles(fromDeviceId, [file]);
          }
          return;
        }
      } catch {
        // Not a JSON DropZone sync payload; pass through
      }
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
          error: 'Peer disconnected before offer was accepted',
        });
      }
    }
    this.notifyOfferListeners();

    // Do NOT abruptly abort active transfers; pause and mark reconnecting
    for (const [id, sender] of this.senders.entries()) {
      const record = useTransfersStore.getState().transfers[id];
      if (record?.peerId === deviceId && sender.getState() === 'active') {
        sender.pause();
        useTransfersStore.getState().update(id, {
          error: 'Connection interrupted; waiting to reconnect...',
        });
      }
    }

    for (const [id, receiver] of this.receivers.entries()) {
      const record = useTransfersStore.getState().transfers[id];
      if (record?.peerId === deviceId && receiver.getState() === 'active') {
        useTransfersStore.getState().update(id, {
          error: 'Connection interrupted; waiting to reconnect...',
        });
      }
    }
  }

  private handlePeerReady(deviceId: string): void {
    // 1. Sync room transfer history so new/reconnected peer sees all room files
    this.syncRoomHistoryToPeer(deviceId);

    // 2. Automatically resume any paused or interrupted transfers
    for (const [id, receiver] of this.receivers.entries()) {
      const record = useTransfersStore.getState().transfers[id];
      if (record?.peerId === deviceId) {
        useTransfersStore.getState().update(id, { error: undefined });
        receiver.sendResume();
      }
    }

    for (const [id, sender] of this.senders.entries()) {
      const record = useTransfersStore.getState().transfers[id];
      if (record?.peerId === deviceId && sender.getState() === 'paused') {
        useTransfersStore.getState().update(id, { error: undefined });
        sender.resume();
      }
    }
  }

  /**
   * Send the room's completed transfers to a peer over the control channel
   * so every peer (new or existing) has the full room transfer history.
   */
  syncRoomHistoryToPeer(peerDeviceId: string): void {
    if (!this.currentRoomCode) return;
    const transport = this.peerManager.getTransport(peerDeviceId);
    if (!transport) return;

    const allTransfers = Object.values(useTransfersStore.getState().transfers);
    const roomRecords = allTransfers.filter(
      (t) => (t.status === 'done' || t.status === 'active') && (!t.roomCode || t.roomCode === this.currentRoomCode),
    );
    if (roomRecords.length === 0) return;

    transport.sendControl({
      t: 'text',
      id: crypto.randomUUID(),
      text: JSON.stringify({
        type: 'dz:history-sync',
        roomCode: this.currentRoomCode,
        records: roomRecords.map((r) => ({
          id: r.id,
          peerId: r.peerId,
          senderName: r.senderName,
          roomCode: this.currentRoomCode,
          name: r.name,
          size: r.size,
          mime: r.mime,
          direction: 'receive',
          status: r.status,
          progress: r.progress,
          transferred: r.transferred,
          speed: 0,
          verified: r.verified,
          startedAt: r.startedAt,
        })),
      }),
    });
  }

  /**
   * Request a file that was previously shared in the room from the peer who holds it.
   */
  requestFile(peerDeviceId: string, name: string, size: number): void {
    const transport = this.peerManager.getTransport(peerDeviceId);
    if (!transport) return;
    transport.sendControl({
      t: 'text',
      id: crypto.randomUUID(),
      text: JSON.stringify({
        type: 'dz:request-file',
        name,
        size,
      }),
    });
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
