import { create } from 'zustand';
import type { ErrorCode } from '@dropzone/protocol';

export type RoomStatus =
  | 'idle'
  | 'creating'
  | 'joining'
  | 'joined'
  | 'left'
  | 'error';

export interface RoomError {
  code: ErrorCode | 'NETWORK' | 'ROOM_CLOSED';
  message: string;
}

/** Minimal ICE server shape shared with RTCPeerConnection. */
export interface IceServerEntry {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface RoomState {
  status: RoomStatus;
  code: string | null;
  isHost: boolean;
  codeExpiresAt: number | null;
  iceServers: IceServerEntry[];
  error: RoomError | null;
  /** socket.io connectivity (signaling link) */
  link: 'connecting' | 'connected' | 'reconnecting';

  setStatus: (status: RoomStatus) => void;
  setLink: (link: RoomState['link']) => void;
  setJoined: (info: { code: string; isHost: boolean; codeExpiresAt: number; iceServers: IceServerEntry[] }) => void;
  setCode: (code: string, codeExpiresAt: number) => void;
  setIceServers: (iceServers: IceServerEntry[]) => void;
  setError: (error: RoomError | null) => void;
  clear: () => void;
}

const initial = {
  status: 'idle' as RoomStatus,
  code: null,
  isHost: false,
  codeExpiresAt: null,
  iceServers: [] as IceServerEntry[],
  error: null,
  link: 'connecting' as const,
};

export const useRoomStore = create<RoomState>((set) => ({
  ...initial,
  setStatus: (status) => set({ status }),
  setLink: (link) => set({ link }),
  setJoined: ({ code, isHost, codeExpiresAt, iceServers }) =>
    set({ status: 'joined', code, isHost, codeExpiresAt, iceServers, error: null }),
  setCode: (code, codeExpiresAt) => set({ code, codeExpiresAt }),
  setIceServers: (iceServers) => set({ iceServers }),
  setError: (error) => set(error ? { status: 'error', error } : { error: null }),
  clear: () => set({ ...initial, link: useRoomStore.getState().link }),
}));
