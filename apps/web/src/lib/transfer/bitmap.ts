/**
 * Compact bitset representing received chunk indexes for a transfer (TRD §10.2).
 * Serialized to base64 for transmission in `resume` control messages and persistence
 * in IndexedDB.
 */
export class ChunkBitmap {
  public readonly totalChunks: number;
  private readonly bytes: Uint8Array;
  private setBitsCount = 0;

  constructor(totalChunks: number, bytes?: Uint8Array) {
    if (totalChunks < 0) throw new Error('totalChunks cannot be negative');
    this.totalChunks = totalChunks;
    const byteLength = Math.ceil(totalChunks / 8);
    if (bytes) {
      if (bytes.byteLength < byteLength) {
        throw new Error(`Buffer too short: got ${bytes.byteLength}, expected ${byteLength}`);
      }
      this.bytes = new Uint8Array(bytes.buffer, bytes.byteOffset, byteLength);
      // Count set bits
      let count = 0;
      for (let i = 0; i < totalChunks; i++) {
        const byteIdx = Math.floor(i / 8);
        const bitIdx = i % 8;
        if ((this.bytes[byteIdx]! & (1 << bitIdx)) !== 0) {
          count++;
        }
      }
      this.setBitsCount = count;
    } else {
      this.bytes = new Uint8Array(byteLength);
      this.setBitsCount = 0;
    }
  }

  static empty(totalChunks: number): ChunkBitmap {
    return new ChunkBitmap(totalChunks);
  }

  static full(totalChunks: number): ChunkBitmap {
    const bitmap = new ChunkBitmap(totalChunks);
    for (let i = 0; i < totalChunks; i++) {
      bitmap.set(i);
    }
    return bitmap;
  }

  set(index: number): void {
    if (index < 0 || index >= this.totalChunks) {
      throw new Error(`Index ${index} out of range [0, ${this.totalChunks})`);
    }
    const byteIdx = Math.floor(index / 8);
    const bitIdx = index % 8;
    const mask = 1 << bitIdx;
    if ((this.bytes[byteIdx]! & mask) === 0) {
      this.bytes[byteIdx]! |= mask;
      this.setBitsCount++;
    }
  }

  has(index: number): boolean {
    if (index < 0 || index >= this.totalChunks) return false;
    const byteIdx = Math.floor(index / 8);
    const bitIdx = index % 8;
    return (this.bytes[byteIdx]! & (1 << bitIdx)) !== 0;
  }

  count(): number {
    return this.setBitsCount;
  }

  isComplete(): boolean {
    return this.totalChunks > 0 && this.setBitsCount === this.totalChunks;
  }

  missingIndices(): number[] {
    const missing: number[] = [];
    for (let i = 0; i < this.totalChunks; i++) {
      if (!this.has(i)) {
        missing.push(i);
      }
    }
    return missing;
  }

  toBase64(): string {
    let binary = '';
    const len = this.bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(this.bytes[i]!);
    }
    return btoa(binary);
  }

  static fromBase64(b64: string, totalChunks: number): ChunkBitmap {
    if (!b64) return new ChunkBitmap(totalChunks);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new ChunkBitmap(totalChunks, bytes);
  }

  getRawBytes(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
