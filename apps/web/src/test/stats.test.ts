import { describe, it, expect } from 'vitest';
import {
  classifyCandidateTypes,
  normalizeCandidateType,
  extractSelectedCandidateTypes,
} from '../lib/rtc/stats.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stats(partial: Record<string, unknown>): any {
  return partial;
}

describe('normalizeCandidateType', () => {
  it('passes through known candidate types', () => {
    expect(normalizeCandidateType('host')).toBe('host');
    expect(normalizeCandidateType('srflx')).toBe('srflx');
    expect(normalizeCandidateType('prflx')).toBe('prflx');
    expect(normalizeCandidateType('relay')).toBe('relay');
  });

  it('maps anything else to unknown', () => {
    expect(normalizeCandidateType('weird')).toBe('unknown');
    expect(normalizeCandidateType(undefined)).toBe('unknown');
    expect(normalizeCandidateType(42)).toBe('unknown');
  });
});

describe('classifyCandidateTypes', () => {
  it('host+host is direct-local', () => {
    expect(classifyCandidateTypes('host', 'host')).toBe('direct-local');
  });

  it('srflx on either side is direct-internet', () => {
    expect(classifyCandidateTypes('srflx', 'host')).toBe('direct-internet');
    expect(classifyCandidateTypes('host', 'srflx')).toBe('direct-internet');
    expect(classifyCandidateTypes('prflx', 'prflx')).toBe('direct-internet');
  });

  it('relay on either side wins over host', () => {
    expect(classifyCandidateTypes('relay', 'host')).toBe('relayed');
    expect(classifyCandidateTypes('host', 'relay')).toBe('relayed');
    expect(classifyCandidateTypes('relay', 'relay')).toBe('relayed');
    expect(classifyCandidateTypes('relay', 'srflx')).toBe('relayed');
  });

  it('missing candidate types are not claimed as local', () => {
    expect(classifyCandidateTypes(undefined, undefined)).toBe('direct-internet');
  });
});

describe('extract + classify pipeline (FR-30)', () => {
  it('classifies a host+host selected pair as direct-local', () => {
    const report = new Map<string, RTCStats>([
      ['t1', stats({ id: 't1', type: 'transport', selectedCandidatePairId: 'p1' })],
      ['p1', stats({ id: 'p1', type: 'candidate-pair', localCandidateId: 'c1', remoteCandidateId: 'c2' })],
      ['c1', stats({ id: 'c1', type: 'candidate', candidateType: 'host' })],
      ['c2', stats({ id: 'c2', type: 'candidate', candidateType: 'host' })],
    ]);

    const types = extractSelectedCandidateTypes(report);
    expect(types).toBeDefined();
    expect(classifyCandidateTypes(types?.localType, types?.remoteType)).toBe('direct-local');
  });
});

describe('extractSelectedCandidateTypes', () => {
  it('returns undefined when no transport or nominated pair exists', () => {
    const report = new Map<string, RTCStats>();
    expect(extractSelectedCandidateTypes(report)).toBeUndefined();
  });

  it('uses the transport selectedCandidatePairId when present', () => {
    const report = new Map<string, RTCStats>([
      ['t1', stats({ id: 't1', type: 'transport', selectedCandidatePairId: 'p1' })],
      ['p1', stats({ id: 'p1', type: 'candidate-pair', localCandidateId: 'c1', remoteCandidateId: 'c2' })],
      ['c1', stats({ id: 'c1', type: 'candidate', candidateType: 'host' })],
      ['c2', stats({ id: 'c2', type: 'candidate', candidateType: 'srflx' })],
    ]);

    expect(extractSelectedCandidateTypes(report)).toEqual({ localType: 'host', remoteType: 'srflx' });
  });

  it('falls back to a nominated succeeded pair', () => {
    const report = new Map<string, RTCStats>([
      ['p1', stats({ id: 'p1', type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'c1', remoteCandidateId: 'c2' })],
      ['c1', stats({ id: 'c1', type: 'candidate', candidateType: 'relay' })],
      ['c2', stats({ id: 'c2', type: 'candidate', candidateType: 'host' })],
    ]);

    expect(extractSelectedCandidateTypes(report)).toEqual({ localType: 'relay', remoteType: 'host' });
  });
});
