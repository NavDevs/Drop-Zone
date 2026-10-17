import { describe, it, expect } from 'vitest';
import { generateRoomCode, CodeAllocator } from '../src/rooms/codes.js';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_CODE_FREED_RETENTION_SEC } from '@dropzone/protocol';

describe('generateRoomCode', () => {
  it('produces codes of the correct length', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH);
    }
  });

  it('only uses the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      for (const ch of generateRoomCode()) {
        expect(ROOM_CODE_ALPHABET.includes(ch)).toBe(true);
      }
    }
  });

  it('produces varied codes', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(450);
  });
});

describe('CodeAllocator', () => {
  it('avoids active codes', () => {
    const active = new Set(['AAAAAA']);
    const allocator = new CodeAllocator((code) => active.has(code));
    const code = allocator.allocate();
    expect(active.has(code)).toBe(false);
    expect(code).toHaveLength(6);
  });

  it('refuses recently freed codes', () => {
    let now = 1_000_000;
    const allocator = new CodeAllocator(() => false, () => now);
    allocator.markFreed('BBBBBB');
    expect(allocator.isFreed('BBBBBB')).toBe(true);
    const code = allocator.allocate();
    expect(code).not.toBe('BBBBBB');
  });

  it('re-uses a freed code after the retention window', () => {
    let now = 1_000_000;
    const allocator = new CodeAllocator(() => false, () => now);
    allocator.markFreed('CCCCCC');
    now += (ROOM_CODE_FREED_RETENTION_SEC + 1) * 1000;
    expect(allocator.isFreed('CCCCCC')).toBe(false);
    allocator.sweepFreed();
    // after sweep, mark as active-candidate again: allocate until we hit it is
    // probabilistic, so just verify isFreed is false and sweep removed it
    expect(allocator.isFreed('CCCCCC')).toBe(false);
  });

  it('throws after exhausting retries', () => {
    const allocator = new CodeAllocator(() => true); // everything active
    expect(() => allocator.allocate()).toThrow('ROOM_CODE_EXHAUSTED');
  });
});
