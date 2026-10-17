import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateDeviceName,
  getDeviceId,
  getDeviceName,
  setDeviceName,
  detectDeviceType,
  buildDeviceInfo,
} from '../lib/device.js';

describe('generateDeviceName', () => {
  it('produces "Adjective Animal" shape', () => {
    expect(generateDeviceName(() => 0)).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it('is deterministic for a fixed rng', () => {
    expect(generateDeviceName(() => 0)).toBe(generateDeviceName(() => 0));
  });
});

describe('deviceId / deviceName persistence', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns a stable id across calls (per tab)', () => {
    const a = getDeviceId();
    expect(a).toBeTruthy();
    expect(getDeviceId()).toBe(a);
  });

  it('persists a custom device name', () => {
    const original = getDeviceName();
    setDeviceName('Renamed Device');
    expect(getDeviceName()).toBe('Renamed Device');
    setDeviceName(original);
  });
});

describe('detectDeviceType', () => {
  it('detects iPhone as phone', () => {
    expect(detectDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 0)).toBe('phone');
  });
  it('detects iPad as tablet', () => {
    expect(detectDeviceType('Mozilla/5.0 (iPad; CPU OS 17_0)', 5)).toBe('tablet');
  });
  it('detects Windows desktop', () => {
    expect(detectDeviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe('desktop');
  });
  it('detects macOS laptop (no touch)', () => {
    expect(detectDeviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 0)).toBe('laptop');
  });
  it('falls back to unknown', () => {
    expect(detectDeviceType('SomethingElse', 0)).toBe('unknown');
  });
});

describe('buildDeviceInfo', () => {
  beforeEach(() => sessionStorage.clear());

  it('includes the persisted id and name', () => {
    const info = buildDeviceInfo();
    expect(info.deviceId).toBe(getDeviceId());
    expect(info.name).toBe(getDeviceName());
    expect(typeof info.type).toBe('string');
  });
});
