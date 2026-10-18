import { create } from 'zustand';

export type TransferDirection = 'send' | 'receive';
export type TransferStatus = 'queued' | 'offering' | 'active' | 'done' | 'error' | 'cancelled' | 'declined';

export interface TransferRecord {
  id: number;
  peerId: string;
  name: string;
  size: number;
  mime: string;
  direction: TransferDirection;
  status: TransferStatus;
  /** 0..1 */
  progress: number;
  /** bytes transferred */
  transferred: number;
  /** EWMA bytes/sec */
  speed: number;
  /** Estimated seconds remaining */
  eta?: number | null;
  /** Object URL for downloading received file */
  downloadUrl?: string;
  startedAt: number;
  error?: string;
}

interface TransfersState {
  transfers: Record<number, TransferRecord>;
  add: (record: TransferRecord) => void;
  update: (id: number, patch: Partial<TransferRecord>) => void;
  remove: (id: number) => void;
  reset: () => void;
}

export const useTransfersStore = create<TransfersState>((set) => ({
  transfers: {},
  add: (record) => set((s) => ({ transfers: { ...s.transfers, [record.id]: record } })),
  update: (id, patch) =>
    set((s) => {
      const existing = s.transfers[id];
      if (!existing) return s;
      return { transfers: { ...s.transfers, [id]: { ...existing, ...patch } } };
    }),
  remove: (id) =>
    set((s) => {
      const transfers = { ...s.transfers };
      delete transfers[id];
      return { transfers };
    }),
  reset: () => set({ transfers: {} }),
}));
