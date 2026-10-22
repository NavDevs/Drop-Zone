import { describe, it, expect } from 'vitest';
import {
  generateSyntheticChunk,
  exportResultsToCsv,
  formatMbps,
  type BenchmarkResult,
} from '../lib/benchmark/benchmark.js';

describe('Benchmark Suite', () => {
  it('generates deterministic pseudo-random chunks', () => {
    const chunk1 = generateSyntheticChunk(1024, 123);
    const chunk2 = generateSyntheticChunk(1024, 123);
    const chunk3 = generateSyntheticChunk(1024, 456);

    expect(chunk1.byteLength).toBe(1024);
    expect(chunk1).toEqual(chunk2);
    expect(chunk1).not.toEqual(chunk3);
  });

  it('formats Mbps correctly', () => {
    expect(formatMbps(123.456)).toBe('123.46 Mbps');
  });

  it('exports results to CSV with headers and rows', () => {
    const results: BenchmarkResult[] = [
      {
        chunkSize: 16384,
        totalBytes: 1048576,
        durationMs: 25.5,
        throughputMbps: 328.96,
        rttMs: 4,
      },
      {
        chunkSize: 32768,
        totalBytes: 1048576,
        durationMs: 18.2,
        throughputMbps: 460.91,
      },
    ];

    const csv = exportResultsToCsv(results);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe('Chunk Size (bytes),Total Bytes,Duration (ms),Throughput (Mbps),RTT (ms)');
    expect(lines[1]).toContain('16384,1048576,25.5,328.96,4');
    expect(lines[2]).toContain('32768,1048576,18.2,460.91,N/A');
  });
});
