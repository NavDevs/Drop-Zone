import type { DeviceInfo } from '@dropzone/protocol';
import {
  MAX_PEERS_PER_ROOM,
  ROOM_HARD_MAX,
  ROOM_IDLE_TIMEOUT,
  ROOM_TTL_DEFAULT,
  ROOM_SWEEP_INTERVAL_SEC,
} from '@dropzone/protocol';
import { CodeAllocator } from './codes.js';

export interface RoomPeer {
  socketId: string;
  info: DeviceInfo;
  joinedAt: number;
}

export interface Room {
  code: string;
  createdAt: number;
  ttlSec: number;
  codeExpiresAt: number;
  hardExpiresAt: number;
  lastActivityAt: number;
  hostDeviceId: string;
  peers: Map<string, RoomPeer>;
}

export type RoomCloseReason = 'empty' | 'idle' | 'hard-expiry' | 'host-closed';

export const CLOSE_REASON_TEXT: Record<RoomCloseReason, string> = {
  'host-closed': 'HOST_CLOSED',
  idle: 'IDLE_TIMEOUT',
  'hard-expiry': 'HARD_EXPIRY',
  empty: 'ROOM_EMPTY',
};

export interface ClosedRoom {
  room: Room;
  reason: RoomCloseReason;
}

export interface RoomStoreOptions {
  now?: () => number;
  maxPeers?: number;
  defaultTtlSec?: number;
  idleTimeoutSec?: number;
  hardMaxSec?: number;
  sweepIntervalMs?: number;
  onClosed?: (room: Room, reason: RoomCloseReason) => void;
}

/**
 * In-memory room lifecycle store. Expiry checks are lazy (on lookup) and
 * an optional sweeper closes idle/hard-expired rooms proactively.
 */
export class RoomStore {
  private rooms = new Map<string, Room>();
  private deviceToCode = new Map<string, string>();
  readonly codes: CodeAllocator;
  private readonly now: () => number;
  private readonly maxPeers: number;
  private readonly defaultTtlSec: number;
  private readonly idleTimeoutSec: number;
  private readonly hardMaxSec: number;
  private readonly sweepIntervalMs: number;
  private readonly onClosed: ((room: Room, reason: RoomCloseReason) => void) | undefined;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;

  constructor(opts: RoomStoreOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.maxPeers = opts.maxPeers ?? MAX_PEERS_PER_ROOM;
    this.defaultTtlSec = opts.defaultTtlSec ?? ROOM_TTL_DEFAULT;
    this.idleTimeoutSec = opts.idleTimeoutSec ?? ROOM_IDLE_TIMEOUT;
    this.hardMaxSec = opts.hardMaxSec ?? ROOM_HARD_MAX;
    this.sweepIntervalMs = opts.sweepIntervalMs ?? ROOM_SWEEP_INTERVAL_SEC * 1000;
    this.onClosed = opts.onClosed;
    this.codes = new CodeAllocator((code) => this.rooms.has(code), this.now);
  }

  startSweeper(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      this.sweep();
    }, this.sweepIntervalMs);
    this.sweepTimer.unref?.();
  }

  stopSweeper(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
  }

  createRoom(host: DeviceInfo, socketId: string, opts: { ttlSec?: number } = {}): Room {
    const code = this.codes.allocate();
    const createdAt = this.now();
    const ttlSec = opts.ttlSec ?? this.defaultTtlSec;
    const room: Room = {
      code,
      createdAt,
      ttlSec,
      codeExpiresAt: createdAt + ttlSec * 1000,
      hardExpiresAt: createdAt + this.hardMaxSec * 1000,
      lastActivityAt: createdAt,
      hostDeviceId: host.deviceId,
      peers: new Map([[host.deviceId, { socketId, info: host, joinedAt: createdAt }]]),
    };
    this.rooms.set(code, room);
    this.deviceToCode.set(host.deviceId, code);
    return room;
  }

  getByCode(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  getByDevice(deviceId: string): Room | undefined {
    const code = this.deviceToCode.get(deviceId);
    if (!code) return undefined;
    return this.rooms.get(code);
  }

  isJoinable(room: Room): boolean {
    return this.now() < room.codeExpiresAt;
  }

  peerCount(room: Room): number {
    return room.peers.size;
  }

  canAcceptPeer(room: Room): boolean {
    return room.peers.size < this.maxPeers;
  }

  addPeer(room: Room, device: DeviceInfo, socketId: string): RoomPeer {
    const peer: RoomPeer = { socketId, info: device, joinedAt: this.now() };
    room.peers.set(device.deviceId, peer);
    this.deviceToCode.set(device.deviceId, room.code);
    this.touch(room);
    return peer;
  }

  removePeer(room: Room, deviceId: string): { peer: RoomPeer | undefined; becameHost: boolean } {
    const peer = room.peers.get(deviceId);
    room.peers.delete(deviceId);
    if (this.deviceToCode.get(deviceId) === room.code) {
      this.deviceToCode.delete(deviceId);
    }
    let becameHost = false;
    if (room.hostDeviceId === deviceId) {
      becameHost = this.promoteHost(room);
    }
    this.touch(room);
    return { peer, becameHost };
  }

  private promoteHost(room: Room): boolean {
    let earliest: RoomPeer | undefined;
    let earliestId = '';
    for (const [id, peer] of room.peers) {
      if (!earliest || peer.joinedAt < earliest.joinedAt) {
        earliest = peer;
        earliestId = id;
      }
    }
    if (!earliest) return false;
    room.hostDeviceId = earliestId;
    return true;
  }

  regenerateCode(room: Room): { oldCode: string; code: string; codeExpiresAt: number } {
    const oldCode = room.code;
    const code = this.codes.allocate();
    const codeExpiresAt = this.now() + room.ttlSec * 1000;
    this.rooms.delete(oldCode);
    room.code = code;
    room.codeExpiresAt = codeExpiresAt;
    this.rooms.set(code, room);
    for (const deviceId of room.peers.keys()) {
      this.deviceToCode.set(deviceId, code);
    }
    this.codes.markFreed(oldCode);
    this.touch(room);
    return { oldCode, code, codeExpiresAt };
  }

  touch(room: Room): void {
    room.lastActivityAt = this.now();
  }

  closeRoom(room: Room, _reason: RoomCloseReason): void {
    this.rooms.delete(room.code);
    this.codes.markFreed(room.code);
    for (const deviceId of room.peers.keys()) {
      if (this.deviceToCode.get(deviceId) === room.code) {
        this.deviceToCode.delete(deviceId);
      }
    }
    // peer maps are intentionally left intact so callers can still
    // notify members; the room is unreachable from the store after this point
  }

  isExpired(room: Room): 'idle' | 'hard' | false {
    const now = this.now();
    if (now >= room.hardExpiresAt) return 'hard';
    if (now - room.lastActivityAt >= this.idleTimeoutSec * 1000) return 'idle';
    return false;
  }

  sweep(): ClosedRoom[] {
    const closed: ClosedRoom[] = [];
    for (const room of [...this.rooms.values()]) {
      const expired = this.isExpired(room);
      if (expired) {
        const reason: RoomCloseReason = expired === 'hard' ? 'hard-expiry' : 'idle';
        this.closeRoom(room, reason);
        this.onClosed?.(room, reason);
        closed.push({ room, reason });
      }
    }
    this.codes.sweepFreed();
    return closed;
  }

  get size(): number {
    return this.rooms.size;
  }
}
