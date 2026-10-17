import { describe, it, expect, beforeEach } from 'vitest';
import { RoomStore } from '../src/rooms/RoomStore.js';
import { ROOM_HARD_MAX, ROOM_IDLE_TIMEOUT, ROOM_TTL_DEFAULT } from '@dropzone/protocol';
import type { DeviceInfo } from '@dropzone/protocol';

function device(n: number): DeviceInfo {
  return {
    deviceId: `00000000-0000-4000-8000-00000000000${n}`,
    name: `Device ${n}`,
    type: 'laptop',
  };
}

describe('RoomStore', () => {
  let now: number;
  let store: RoomStore;

  beforeEach(() => {
    now = 1_000_000_000_000;
    store = new RoomStore({ now: () => now });
  });

  it('creates a room with the host as first peer', () => {
    const room = store.createRoom(device(1), 'sock1');
    expect(room.code).toHaveLength(6);
    expect(room.hostDeviceId).toBe(device(1).deviceId);
    expect(room.peers.size).toBe(1);
    expect(room.codeExpiresAt).toBe(now + ROOM_TTL_DEFAULT * 1000);
    expect(store.getByCode(room.code)).toBe(room);
    expect(store.getByDevice(device(1).deviceId)).toBe(room);
  });

  it('respects custom ttl and requireApproval', () => {
    const room = store.createRoom(device(1), 'sock1', { ttlSec: 300, requireApproval: true });
    expect(room.ttlSec).toBe(300);
    expect(room.codeExpiresAt).toBe(now + 300 * 1000);
    expect(room.requireApproval).toBe(true);
  });

  it('blocks joins after code expiry but keeps the room', () => {
    const room = store.createRoom(device(1), 'sock1', { ttlSec: 300 });
    expect(store.isJoinable(room)).toBe(true);
    now += 301_000;
    expect(store.isJoinable(room)).toBe(false);
    expect(store.getByCode(room.code)).toBe(room); // still in store
  });

  it('enforces peer capacity', () => {
    const room = store.createRoom(device(1), 'sock1');
    for (let i = 2; i <= 8; i++) {
      store.addPeer(room, device(i), `sock${i}`);
    }
    expect(store.canAcceptPeer(room)).toBe(false);
    expect(store.peerCount(room)).toBe(8);
  });

  it('migrates host on host removal', () => {
    const room = store.createRoom(device(1), 'sock1');
    now += 1000;
    store.addPeer(room, device(2), 'sock2');
    const { becameHost } = store.removePeer(room, device(1).deviceId);
    expect(becameHost).toBe(true);
    expect(room.hostDeviceId).toBe(device(2).deviceId);
  });

  it('promotes the earliest joiner as new host', () => {
    const room = store.createRoom(device(1), 'sock1');
    now += 1000;
    store.addPeer(room, device(2), 'sock2');
    now += 1000;
    store.addPeer(room, device(3), 'sock3');
    store.removePeer(room, device(1).deviceId);
    expect(room.hostDeviceId).toBe(device(2).deviceId);
  });

  it('regenerateCode invalidates the old code immediately', () => {
    const room = store.createRoom(device(1), 'sock1');
    const oldCode = room.code;
    const { code } = store.regenerateCode(room);
    expect(code).not.toBe(oldCode);
    expect(store.getByCode(oldCode)).toBeUndefined();
    expect(store.getByCode(code)).toBe(room);
    expect(store.getByDevice(device(1).deviceId)).toBe(room);
    expect(store.codes.isFreed(oldCode)).toBe(true);
  });

  it('pending joiners: approve moves them into peers', () => {
    const room = store.createRoom(device(1), 'sock1', { requireApproval: true });
    store.addPending(room, device(2), 'sock2');
    expect(room.peers.size).toBe(1);
    const approved = store.approvePending(room, device(2).deviceId);
    expect(approved?.peer.info.deviceId).toBe(device(2).deviceId);
    expect(room.peers.size).toBe(2);
    expect(room.pending.size).toBe(0);
  });

  it('pending joiners: deny removes them', () => {
    const room = store.createRoom(device(1), 'sock1', { requireApproval: true });
    store.addPending(room, device(2), 'sock2');
    const denied = store.denyPending(room, device(2).deviceId);
    expect(denied?.info.deviceId).toBe(device(2).deviceId);
    expect(room.pending.size).toBe(0);
  });

  it('sweep closes idle rooms', () => {
    const room = store.createRoom(device(1), 'sock1');
    now += (ROOM_IDLE_TIMEOUT + 1) * 1000;
    const closed = store.sweep();
    expect(closed).toHaveLength(1);
    expect(closed[0]?.reason).toBe('idle');
    expect(store.getByCode(room.code)).toBeUndefined();
  });

  it('sweep closes hard-expired rooms', () => {
    const room = store.createRoom(device(1), 'sock1');
    // keep touching so idle never triggers; advance past hard max
    for (let i = 0; i < 7; i++) {
      now += 3 * 60 * 60 * 1000; // 3 h steps
      if (now < room.hardExpiresAt) store.touch(room);
    }
    const closed = store.sweep();
    expect(closed.some((c) => c.reason === 'hard-expiry')).toBe(true);
    expect(store.getByCode(room.code)).toBeUndefined();
  });

  it('activity defers idle expiry', () => {
    const room = store.createRoom(device(1), 'sock1');
    for (let i = 0; i < 5; i++) {
      now += (ROOM_IDLE_TIMEOUT - 60) * 1000;
      store.touch(room);
      expect(store.sweep()).toHaveLength(0);
    }
    expect(now - room.createdAt).toBeLessThanOrEqual(ROOM_HARD_MAX * 1000);
  });

  it('closeRoom frees the code for retention', () => {
    const room = store.createRoom(device(1), 'sock1');
    store.closeRoom(room, 'host-closed');
    expect(store.getByCode(room.code)).toBeUndefined();
    expect(store.codes.isFreed(room.code)).toBe(true);
  });

  it('removePeer clears device mapping so getByDevice returns undefined', () => {
    const room = store.createRoom(device(1), 'sock1');
    store.addPeer(room, device(2), 'sock2');
    store.removePeer(room, device(2).deviceId);
    expect(store.getByDevice(device(2).deviceId)).toBeUndefined();
    expect(store.getByDevice(device(1).deviceId)).toBe(room);
  });
});
