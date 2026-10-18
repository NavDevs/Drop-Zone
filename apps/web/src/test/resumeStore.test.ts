import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveResumeRecord,
  getResumeRecord,
  findMatchingResumeRecord,
  deleteResumeRecord,
  purgeExpiredResumeRecords,
  listResumeRecords,
  type ResumeRecord,
} from '../lib/transfer/resumeStore.js';

describe('resumeStore', () => {
  const sampleRecord: ResumeRecord = {
    transferId: 1001,
    peerDeviceId: 'peer-abc-123',
    name: 'test-file.zip',
    size: 5000000,
    lastModified: 1700000000000,
    chunkSize: 16384,
    totalChunks: 306,
    bitmap: 'AAAA',
    received: 10,
    writerKind: 'memory',
    updatedAt: Date.now(),
  };

  beforeEach(async () => {
    await deleteResumeRecord(1001);
    await deleteResumeRecord(1002);
  });

  it('saves and retrieves a resume record', async () => {
    await saveResumeRecord(sampleRecord);
    const retrieved = await getResumeRecord(1001);
    expect(retrieved).toBeDefined();
    expect(retrieved?.transferId).toBe(1001);
    expect(retrieved?.name).toBe('test-file.zip');
    expect(retrieved?.received).toBe(10);
  });

  it('finds matching resume record by name, size, lastModified', async () => {
    await saveResumeRecord(sampleRecord);
    const match = await findMatchingResumeRecord('test-file.zip', 5000000, 1700000000000);
    expect(match).toBeDefined();
    expect(match?.transferId).toBe(1001);

    const noMatch = await findMatchingResumeRecord('other.zip', 5000000, 1700000000000);
    expect(noMatch).toBeUndefined();
  });

  it('deletes a record by transferId', async () => {
    await saveResumeRecord(sampleRecord);
    await deleteResumeRecord(1001);
    const retrieved = await getResumeRecord(1001);
    expect(retrieved).toBeUndefined();
  });

  it('lists all saved records', async () => {
    await saveResumeRecord(sampleRecord);
    await saveResumeRecord({ ...sampleRecord, transferId: 1002, name: 'file2.bin' });

    const records = await listResumeRecords();
    expect(records.length).toBeGreaterThanOrEqual(2);
  });

  it('purges records older than TTL', async () => {
    await saveResumeRecord({
      ...sampleRecord,
      transferId: 1001,
      updatedAt: Date.now() - 100000,
    });
    // Record was updated with Date.now() inside saveResumeRecord, so we test with a very small ttl
    const purged = await purgeExpiredResumeRecords(0); // Cutoff is Date.now()
    expect(purged).toBeGreaterThanOrEqual(1);

    const retrieved = await getResumeRecord(1001);
    expect(retrieved).toBeUndefined();
  });
});
