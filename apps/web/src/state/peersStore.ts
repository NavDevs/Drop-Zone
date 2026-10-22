import { create } from 'zustand';
import type { DeviceInfo } from '@dropzone/protocol';

export type PeerPresence = 'online' | 'connecting' | 'direct' | 'relayed' | 'offline';

export interface PeerRecord {
  device: DeviceInfo;
  joinedAt: number;
  presence: PeerPresence;
}

export interface PeerNotification {
  id: string;
  type: 'join' | 'leave';
  name: string;
  timestamp: number;
}

interface PeersState {
  /** Other devices in the room, keyed by deviceId (self excluded). */
  peers: Record<string, PeerRecord>;
  /** Host view: join requests awaiting approval, keyed by deviceId. */
  pending: Record<string, DeviceInfo>;
  notifications: PeerNotification[];
  selfId: string | null;

  setSelfId: (id: string | null) => void;
  upsertPeer: (device: DeviceInfo, joinedAt?: number) => void;
  setPresence: (deviceId: string, presence: PeerPresence) => void;
  removePeer: (deviceId: string) => void;
  setAll: (peers: PeerRecord[]) => void;
  addPending: (device: DeviceInfo) => void;
  resolvePending: (deviceId: string) => void;
  dismissNotification: (id: string) => void;
  reset: () => void;
}

const initial = {
  peers: {} as Record<string, PeerRecord>,
  pending: {} as Record<string, DeviceInfo>,
  notifications: [] as PeerNotification[],
  selfId: null as string | null,
};

export const usePeersStore = create<PeersState>((set) => ({
  ...initial,
  setSelfId: (selfId) => set({ selfId }),
  upsertPeer: (device, joinedAt) =>
    set((s) => {
      if (device.deviceId === s.selfId) return s;
      const existing = s.peers[device.deviceId];
      const newNotifications = !existing
        ? [
            ...s.notifications,
            { id: crypto.randomUUID(), type: 'join' as const, name: device.name, timestamp: Date.now() },
          ]
        : s.notifications;
      return {
        notifications: newNotifications,
        peers: {
          ...s.peers,
          [device.deviceId]: {
            device,
            joinedAt: joinedAt ?? existing?.joinedAt ?? Date.now(),
            presence: existing?.presence ?? 'online',
          },
        },
      };
    }),
  setPresence: (deviceId, presence) =>
    set((s) => {
      const existing = s.peers[deviceId];
      if (!existing || existing.presence === presence) return s;
      return { peers: { ...s.peers, [deviceId]: { ...existing, presence } } };
    }),
  removePeer: (deviceId) =>
    set((s) => {
      const existing = s.peers[deviceId];
      const peers = { ...s.peers };
      delete peers[deviceId];
      const pending = { ...s.pending };
      delete pending[deviceId];
      const newNotifications = existing
        ? [
            ...s.notifications,
            { id: crypto.randomUUID(), type: 'leave' as const, name: existing.device.name, timestamp: Date.now() },
          ]
        : s.notifications;
      return { peers, pending, notifications: newNotifications };
    }),
  dismissNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),
  setAll: (list) =>
    set(() => {
      const peers: Record<string, PeerRecord> = {};
      for (const p of list) {
        if (p.device.deviceId !== usePeersStore.getState().selfId) {
          peers[p.device.deviceId] = p;
        }
      }
      return { peers };
    }),
  addPending: (device) =>
    set((s) => (s.selfId === device.deviceId ? s : { pending: { ...s.pending, [device.deviceId]: device } })),
  resolvePending: (deviceId) =>
    set((s) => {
      const pending = { ...s.pending };
      delete pending[deviceId];
      return { pending };
    }),
  reset: () => set({ ...initial }),
}));
