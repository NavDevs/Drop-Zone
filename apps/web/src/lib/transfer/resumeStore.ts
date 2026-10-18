import { openDB, type IDBPDatabase } from 'idb';
import { RESUME_RECORD_TTL_MS } from '@dropzone/protocol';

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
const DB_VERSION = 1;
const STORE_NAME = 'resumes';

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
