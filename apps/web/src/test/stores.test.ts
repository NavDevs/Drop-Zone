import { describe, it, expect } from 'vitest';
import { useRoomStore } from '../state/roomStore.js';
import { usePeersStore } from '../state/peersStore.js';
import { unwrapAck, type AckEnvelope } from '../lib/signaling/events.js';
import { friendlyError, roomClosedReason } from '../lib/errors.js';

const device = (id: string, name = id) => ({ deviceId: id, name, type: 'desktop' as const });

describe('roomStore', () => {
  it('setJoined marks joined + host', () => {
    useRoomStore.getState().setJoined({
      code: 'ABC234',
      isHost: true,
      codeExpiresAt: Date.now() + 60_000,
      iceServers: [],
    });
    const s = useRoomStore.getState();
    expect(s.status).toBe('joined');
    expect(s.code).toBe('ABC234');
    expect(s.isHost).toBe(true);
  });

  it('setError sets error status', () => {
    useRoomStore.getState().setError({ code: 'ROOM_CLOSED', message: 'gone' });
    expect(useRoomStore.getState().status).toBe('error');
    expect(useRoomStore.getState().error?.code).toBe('ROOM_CLOSED');
  });

  it('clear resets room fields but keeps link', () => {
    useRoomStore.getState().setLink('connected');
    useRoomStore.getState().setJoined({ code: 'AAA111', isHost: false, codeExpiresAt: 1, iceServers: [] });
    useRoomStore.getState().clear();
    const s = useRoomStore.getState();
    expect(s.code).toBeNull();
    expect(s.status).toBe('idle');
    expect(s.link).toBe('connected');
  });
});

describe('peersStore', () => {
  it('upsertPeer excludes self', () => {
    usePeersStore.getState().reset();
    usePeersStore.getState().setSelfId('self-1');
    usePeersStore.getState().upsertPeer(device('self-1'));
    expect(Object.keys(usePeersStore.getState().peers)).toHaveLength(0);
  });

  it('setAll rebuilds the roster, skipping self', () => {
    usePeersStore.getState().reset();
    usePeersStore.getState().setSelfId('self-1');
    usePeersStore.getState().setAll([
      { device: device('self-1'), joinedAt: 1, presence: 'online' },
      { device: device('p2'), joinedAt: 2, presence: 'online' },
    ]);
    expect(Object.keys(usePeersStore.getState().peers)).toEqual(['p2']);
  });
});

describe('unwrapAck', () => {
  it('unwraps a success payload', () => {
    const res = unwrapAck<{ code: string }>({ code: 'ABC234' });
    expect(res).toEqual({ ok: true, data: { code: 'ABC234' } });
  });

  it('unwraps an error envelope', () => {
    const env: AckEnvelope<never> = { error: { code: 'ROOM_FULL', message: 'full' } };
    expect(unwrapAck(env)).toEqual({ ok: false, code: 'ROOM_FULL', message: 'full' });
  });
});

describe('error copy', () => {
  it('maps ROOM_NOT_FOUND to the recovery hint', () => {
    expect(friendlyError('ROOM_NOT_FOUND')).toContain('new one');
  });
  it('maps NETWORK copy', () => {
    expect(friendlyError('NETWORK')).toMatch(/Reconnecting/);
  });
  it('maps HOST_CLOSED reason', () => {
    expect(roomClosedReason('HOST_CLOSED')).toContain('host closed');
  });
  it('falls back for unknown close reasons', () => {
    expect(roomClosedReason('WEIRD')).toBe('The room closed.');
  });
});
