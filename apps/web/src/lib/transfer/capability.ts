import { MEMORY_WRITER_MAX_SIZE } from '@dropzone/protocol';
import type { StorageBackendKind } from './resumeStore.js';

/**
 * Capability detection for storage backends and disk quotas (TRD §10.3).
 */
export function supportsFsAccess(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

export function supportsOpfs(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage?.getDirectory === 'function'
  );
}

/**
 * Select best available storage backend based on browser APIs and transfer size.
 */
export function selectStorageBackend(fileSize: number): StorageBackendKind {
  if (supportsFsAccess()) {
    return 'fs-access';
  }
  if (supportsOpfs()) {
    return 'opfs';
  }
  if (fileSize <= MEMORY_WRITER_MAX_SIZE) {
    return 'memory';
  }
  return 'memory'; // MemoryWriter will throw too-large if exceeded
}

export interface StorageEstimateResult {
  quota?: number;
  usage?: number;
  available?: number;
  sufficient: boolean;
}

/**
 * Check disk space via navigator.storage.estimate() (TRD §10.2).
 */
export async function checkStorageEstimate(neededBytes: number): Promise<StorageEstimateResult> {
  if (
    typeof navigator === 'undefined' ||
    !('storage' in navigator) ||
    typeof navigator.storage?.estimate !== 'function'
  ) {
    return { sufficient: true };
  }

  try {
    const est = await navigator.storage.estimate();
    const quota = est.quota;
    const usage = est.usage;
    const available = quota !== undefined && usage !== undefined ? quota - usage : undefined;
    const sufficient = available === undefined || available >= neededBytes;
    return { quota, usage, available, sufficient };
  } catch {
    return { sufficient: true };
  }
}
