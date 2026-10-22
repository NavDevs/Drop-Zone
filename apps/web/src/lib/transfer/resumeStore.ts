import { openDB, type IDBPDatabase } from 'idb';
import { RESUME_RECORD_TTL_MS } from '@dropzone/protocol';
import type { TransferRecord } from '../../state/transfersStore.js';

export type StorageBackendKind = 'fs-access' | 'opfs' | 'memory';

export interface ResumeRecord {
  transferId: number;
  peerDeviceId: string;
  name: string;
  size: number;
  lastModified: number;
  chunkSize: number;
  totalChunks: number;
  bitmap: string; // Base64 chunk bitmap
  received: number;
  writerKind: StorageBackendKind;
  handle?: unknown; // FileSystemFileHandle for FsAccess
  updatedAt: number;
}

const DB_NAME = 'dropzone-transfers';
const DB_VERSION = 2;
const STORE_NAME = 'resumes';
const HISTORY_STORE_NAME = 'room-history';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'transferId' });
          store.createIndex('byPeer', 'peerDeviceId', { unique: false });
          store.createIndex('byFile', ['name', 'size', 'lastModified'], { unique: false });
          store.createIndex('byUpdated', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
          const historyStore = db.createObjectStore(HISTORY_STORE_NAME, { keyPath: 'id' });
          historyStore.createIndex('byRoom', 'roomCode', { unique: false });
          historyStore.createIndex('byStarted', 'startedAt', { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Persist an active or paused transfer state to IndexedDB (TRD §10.4).
 * Called every 64 chunks or 250ms during active transfers.
 */
export async function saveResumeRecord(record: ResumeRecord): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE_NAME, { ...record, updatedAt: Date.now() });
  } catch (err) {
    console.warn('Failed to save resume record to IndexedDB:', err);
  }
}

/**
 * Retrieve a saved resume record by transferId.
 */
export async function getResumeRecord(transferId: number): Promise<ResumeRecord | undefined> {
  try {
    const db = await getDb();
    return await db.get(STORE_NAME, transferId);
  } catch (err) {
    console.warn(`Failed to get resume record ${transferId}:`, err);
    return undefined;
  }
}

/**
 * Find an existing partial transfer matching a file's name, size, and lastModified timestamp.
 */
export async function findMatchingResumeRecord(
  name: string,
  size: number,
  lastModified: number,
): Promise<ResumeRecord | undefined> {
  try {
    const db = await getDb();
    const index = db.transaction(STORE_NAME).store.index('byFile');
    const record = await index.get([name, size, lastModified]);
    return record;
  } catch (err) {
    console.warn('Failed to find matching resume record:', err);
    return undefined;
  }
}

/**
 * Delete a resume record upon completion or cancellation.
 */
export async function deleteResumeRecord(transferId: number): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, transferId);
  } catch (err) {
    console.warn(`Failed to delete resume record ${transferId}:`, err);
  }
}

/**
 * List all saved resume records.
 */
export async function listResumeRecords(): Promise<ResumeRecord[]> {
  try {
    const db = await getDb();
    return await db.getAll(STORE_NAME);
  } catch (err) {
    console.warn('Failed to list resume records:', err);
    return [];
  }
}

/**
 * Purge resume records older than TTL (24 hours per TRD §10.4).
 */
export async function purgeExpiredResumeRecords(ttlMs: number = RESUME_RECORD_TTL_MS): Promise<number> {
  try {
    const db = await getDb();
    const cutoff = Date.now() - ttlMs;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const index = tx.store.index('byUpdated');
    let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));
    let purged = 0;
    while (cursor) {
      await cursor.delete();
      purged++;
      cursor = await cursor.continue();
    }
    await tx.done;
    return purged;
  } catch (err) {
    console.warn('Failed to purge expired resume records:', err);
    return 0;
  }
}

/**
 * Persist a transfer history record for a room so it stays stored and visible to all users.
 */
export async function saveRoomHistoryRecord(record: TransferRecord): Promise<void> {
  try {
    const db = await getDb();
    // Do not store live blob URLs in IndexedDB (not serializable or valid across reloads)
    const toStore = { ...record };
    delete toStore.downloadUrl;
    await db.put(HISTORY_STORE_NAME, toStore);
  } catch (err) {
    console.warn('Failed to save room history record to IndexedDB:', err);
  }
}

/**
 * Retrieve all persisted transfer records for a given room.
 */
export async function getRoomHistory(roomCode: string): Promise<TransferRecord[]> {
  try {
    const db = await getDb();
    const index = db.transaction(HISTORY_STORE_NAME).store.index('byRoom');
    const records = await index.getAll(roomCode);
    return records.sort((a, b) => a.startedAt - b.startedAt);
  } catch (err) {
    console.warn(`Failed to get room history for ${roomCode}:`, err);
    return [];
  }
}

/**
 * Clear persisted transfer history for a closed room.
 */
export async function clearRoomHistory(roomCode: string): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(HISTORY_STORE_NAME, 'readwrite');
    const index = tx.store.index('byRoom');
    let cursor = await index.openCursor(roomCode);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch (err) {
    console.warn(`Failed to clear room history for ${roomCode}:`, err);
  }
}
