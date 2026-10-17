import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_CODE_FREED_RETENTION_SEC } from '@dropzone/protocol';

/**
 * Generates a cryptographically secure room code using the unambiguous
 * 31-character alphabet (no I, L, O, 0, 1).
 */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Allocates room codes, guaranteeing uniqueness against active rooms and
 * a recently-freed pool (to avoid rapid re-use of a just-closed room's code).
 */
export class CodeAllocator {
  private freed = new Map<string, number>(); // code -> freedAt (epoch ms)

  constructor(
    private readonly isCodeActive: (code: string) => boolean,
    private readonly now: () => number = Date.now,
  ) {}

  allocate(): string {
    // 31^6 ~ 887M combinations; a handful of retries is more than enough.
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = generateRoomCode();
      if (!this.isCodeActive(code) && !this.isFreed(code)) {
        return code;
      }
    }
    throw new Error('ROOM_CODE_EXHAUSTED');
  }

  markFreed(code: string): void {
    this.freed.set(code, this.now());
  }

  isFreed(code: string): boolean {
    const freedAt = this.freed.get(code);
    if (freedAt === undefined) return false;
    if (this.now() - freedAt > ROOM_CODE_FREED_RETENTION_SEC * 1000) {
      this.freed.delete(code);
      return false;
    }
    return true;
  }

  sweepFreed(): void {
    const cutoff = this.now() - ROOM_CODE_FREED_RETENTION_SEC * 1000;
    for (const [code, freedAt] of this.freed) {
      if (freedAt <= cutoff) this.freed.delete(code);
    }
  }
}
