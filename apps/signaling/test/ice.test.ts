import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { issueIceServers, computeTurnCredential, refreshDelaySec } from '../src/ice.js';
import { ICE_REFRESH_MARGIN_SEC } from '@dropzone/protocol';

const deviceId = '123e4567-e89b-12d3-a456-426614174000';

describe('computeTurnCredential', () => {
  it('matches coturn HMAC-SHA1 base64', () => {
    const expected = createHmac('sha1', 'secret').update('12345:device').digest('base64');
    expect(computeTurnCredential('secret', '12345:device')).toBe(expected);
  });
});

describe('issueIceServers', () => {
  it('returns STUN only when TURN is not configured', () => {
    const { iceServers, turnExpiresAt } = issueIceServers(deviceId, {
      stunUrls: 'stun:stun.example.com:3478',
      turnUrls: '',
      turnSecret: '',
      turnTtlSec: 3600,
      iceServersJson: '',
    });
    expect(iceServers).toHaveLength(1);
    expect(iceServers[0]?.urls).toEqual(['stun:stun.example.com:3478']);
    expect(turnExpiresAt).toBeUndefined();
  });

  it('issues time-limited TURN credentials', () => {
    const now = () => 1_700_000_000_000;
    const expectedExpiry = Math.floor(1_700_000_000_000 / 1000) + 3600;
    const { iceServers, turnExpiresAt } = issueIceServers(deviceId, {
      stunUrls: 'stun:stun.example.com:3478',
      turnUrls: 'turn:turn.example.com:3478?transport=udp',
      turnSecret: 'topsecret',
      turnTtlSec: 3600,
      iceServersJson: '',
      now,
    });
    expect(iceServers).toHaveLength(2);
    const turn = iceServers[1];
    expect(turn?.username).toBe(`${expectedExpiry}:${deviceId}`);
    expect(turn?.credential).toBe(computeTurnCredential('topsecret', `${expectedExpiry}:${deviceId}`));
    expect(turnExpiresAt).toBe(expectedExpiry);
  });

  it('honours ICE_SERVERS_JSON override', () => {
    const json = JSON.stringify([{ urls: 'stun:custom.example.com:3478' }]);
    const { iceServers, turnExpiresAt } = issueIceServers(deviceId, {
      stunUrls: 'stun:ignored',
      turnUrls: 'turn:ignored',
      turnSecret: 'ignored',
      turnTtlSec: 3600,
      iceServersJson: json,
    });
    expect(iceServers).toEqual([{ urls: 'stun:custom.example.com:3478' }]);
    expect(turnExpiresAt).toBeUndefined();
  });

  it('falls back to env-derived config on malformed ICE_SERVERS_JSON', () => {
    const { iceServers } = issueIceServers(deviceId, {
      stunUrls: 'stun:stun.example.com:3478',
      turnUrls: '',
      turnSecret: '',
      turnTtlSec: 3600,
      iceServersJson: '{not json',
    });
    expect(iceServers).toHaveLength(1);
  });

  it('splits comma-separated STUN urls', () => {
    const { iceServers } = issueIceServers(deviceId, {
      stunUrls: 'stun:a:1, stun:b:2',
      turnUrls: '',
      turnSecret: '',
      turnTtlSec: 3600,
      iceServersJson: '',
    });
    expect(iceServers[0]?.urls).toEqual(['stun:a:1', 'stun:b:2']);
  });
});

describe('refreshDelaySec', () => {
  it('returns margin-adjusted delay before expiry', () => {
    const nowMs = 1_700_000_000_000;
    const expiry = Math.floor(nowMs / 1000) + 3600;
    expect(refreshDelaySec(expiry, nowMs)).toBe(3600 - ICE_REFRESH_MARGIN_SEC);
  });

  it('clamps to at least 1 second', () => {
    const nowMs = 1_700_000_000_000;
    const expiry = Math.floor(nowMs / 1000) + 10;
    expect(refreshDelaySec(expiry, nowMs)).toBe(1);
  });

  it('returns undefined without TURN expiry', () => {
    expect(refreshDelaySec(undefined)).toBeUndefined();
  });
});
