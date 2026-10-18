import { describe, it, expect, vi } from 'vitest';
import {
  supportsFsAccess,
  supportsOpfs,
  selectStorageBackend,
  checkStorageEstimate,
} from '../lib/transfer/capability.js';

describe('capability detection', () => {
  it('detects missing FsAccess in standard test environment', () => {
    // jsdom does not define showSaveFilePicker by default
    expect(supportsFsAccess()).toBe(false);
  });

  it('detects missing OPFS in environment without getDirectory', () => {
    expect(supportsOpfs()).toBe(false);
  });

  it('selects memory backend when specialized backends unavailable', () => {
    const backend = selectStorageBackend(1024 * 1024);
    expect(backend).toBe('memory');
  });

  it('returns sufficient storage estimate when navigator.storage is missing or mockable', async () => {
    const res = await checkStorageEstimate(5000);
    expect(res.sufficient).toBe(true);
  });

  it('checks storage estimate when navigator.storage.estimate is present', async () => {
    const originalStorage = navigator.storage;
    try {
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockResolvedValue({ quota: 10000, usage: 2000 }),
        },
        configurable: true,
      });

      const res = await checkStorageEstimate(5000);
      expect(res.available).toBe(8000);
      expect(res.sufficient).toBe(true);

      const tight = await checkStorageEstimate(9000);
      expect(tight.sufficient).toBe(false);
    } finally {
      Object.defineProperty(navigator, 'storage', {
        value: originalStorage,
        configurable: true,
      });
    }
  });
});
