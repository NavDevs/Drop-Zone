/** Connection classification per TRD §10.1 and FR-30/FR-05. */

/** FR-30 badge classes derived from the selected ICE candidate pair. */
export type ConnectionClass = 'direct-local' | 'direct-internet' | 'relayed';

/** Candidate types as reported by `RTCIceCandidatePair`/`RTCIceCandidate` in getStats(). */
export type CandidateType = 'host' | 'srflx' | 'prflx' | 'relay' | 'unknown';

/**
 * Classify a selected ICE candidate pair from its endpoint candidate types.
 *
 * - any `relay` → Relayed (TURN)
 * - both `host` → Direct (local network)
 * - otherwise (srflx/prflx/unknown) → Direct (internet)
 */
export function classifyCandidateTypes(
  localType: CandidateType | undefined,
  remoteType: CandidateType | undefined,
): ConnectionClass {
  if (localType === 'relay' || remoteType === 'relay') return 'relayed';
  if (localType === 'host' && remoteType === 'host') return 'direct-local';
  return 'direct-internet';
}

/** Normalize a raw `candidateType` string from getStats() into a CandidateType. */
export function normalizeCandidateType(raw: unknown): CandidateType {
  if (raw === 'host' || raw === 'srflx' || raw === 'prflx' || raw === 'relay') return raw;
  return 'unknown';
}

/**
 * Extract the selected candidate pair's endpoint types from a getStats() report.
 *
 * Follows TRD §10.1: find the `transport` stat → `selectedCandidatePairId` →
 * `candidate-pair`; fall back to a pair with `nominated && state === 'succeeded'`.
 * Returns `undefined` when no pair is selected yet.
 */
export function extractSelectedCandidateTypes(report: Map<string, RTCStats>): {
  localType: CandidateType;
  remoteType: CandidateType;
} | undefined {
  let pairId: string | undefined;
  for (const stat of report.values()) {
    if (stat.type === 'transport' && 'selectedCandidatePairId' in stat) {
      const id = (stat as RTCStats & { selectedCandidatePairId?: string }).selectedCandidatePairId;
      if (id) {
        pairId = id;
        break;
      }
    }
  }

  type CandidatePairStat = RTCStats & {
    localCandidateId?: string;
    remoteCandidateId?: string;
    nominated?: boolean;
    state?: string;
  };

  let pair: CandidatePairStat | undefined;
  if (pairId) {
    const candidate = report.get(pairId);
    if (candidate?.type === 'candidate-pair') {
      pair = candidate as CandidatePairStat;
    }
  }
  if (!pair) {
    for (const stat of report.values()) {
      if (stat.type === 'candidate-pair') {
        const p = stat as CandidatePairStat;
        if (p.nominated && p.state === 'succeeded') {
          pair = p;
          break;
        }
      }
    }
  }
  if (!pair) return undefined;

  const readCandidateType = (id: string | undefined): CandidateType => {
    if (!id) return 'unknown';
    const cand = report.get(id) as (RTCStats & { candidateType?: string }) | undefined;
    return normalizeCandidateType(cand?.candidateType);
  };

  return {
    localType: readCandidateType(pair.localCandidateId),
    remoteType: readCandidateType(pair.remoteCandidateId),
  };
}
