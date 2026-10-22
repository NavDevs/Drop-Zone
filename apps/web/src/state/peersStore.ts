import { create } from 'zustand';
import type { DeviceInfo } from '@dropzone/protocol';
import { randomId } from '../lib/device.js';
import { sendSystemNotification } from '../lib/notifications.js';

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
  notifications: PeerNotification[];
  selfId: string | null;

  setSelfId: (id: string | null) => void;
  upsertPeer: (device: DeviceInfo, joinedAt?: number) => void;
  setPresence: (deviceId: string, presence: PeerPresence) => void;
  removePeer: (deviceId: string) => void;
  setAll: (peers: PeerRecord[]) => void;
  dismissNotification: (id: string) => void;
  reset: () => void;
}

const initial = {
  peers: {} as Record<string, PeerRecord>,
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
      if (!existing) {
        sendSystemNotification('Peer Joined', `${device.name} is now online in the room.`);
      }
      const newNotifications = !existing
        ? [
            ...s.notifications,
            { id: randomId(), type: 'join' as const, name: device.name, timestamp: Date.now() },
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
      if (existing) {
        sendSystemNotification('Peer Left', `${existing.device.name} has left the room.`);
      }
      const peers = { ...s.peers };
      delete peers[deviceId];
      const newNotifications = existing
        ? [
            ...s.notifications,
            { id: randomId(), type: 'leave' as const, name: existing.device.name, timestamp: Date.now() },
          ]
        : s.notifications;
      return { peers, notifications: newNotifications };
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
  reset: () => set({ ...initial }),
}));
