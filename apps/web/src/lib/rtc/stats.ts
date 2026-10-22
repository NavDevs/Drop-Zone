/** Connection classification per TRD §10.1, §12 and FR-30/FR-31/FR-32. */

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

export interface DetailedLinkReport {
  localType: CandidateType;
  remoteType: CandidateType;
  currentRoundTripTimeMs?: number;
  availableOutgoingBitrate?: number;
  protocol?: string;
  bytesSent?: number;
  bytesReceived?: number;
}

/**
 * Extract the selected candidate pair's endpoint types and link metrics from a getStats() report (TRD §12).
 */
export function extractSelectedCandidateTypes(report: Map<string, RTCStats>): {
  localType: CandidateType;
  remoteType: CandidateType;
} | undefined {
  const detailed = extractDetailedLinkReport(report);
  if (!detailed) return undefined;
  return {
    localType: detailed.localType,
    remoteType: detailed.remoteType,
  };
}

export function extractDetailedLinkReport(report: Map<string, RTCStats>): DetailedLinkReport | undefined {
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
    currentRoundTripTime?: number;
    availableOutgoingBitrate?: number;
    bytesSent?: number;
    bytesReceived?: number;
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

  let protocol: string | undefined;
  const readCandidateType = (id: string | undefined): CandidateType => {
    if (!id) return 'unknown';
    const cand = report.get(id) as (RTCStats & { candidateType?: string; protocol?: string }) | undefined;
    if (cand?.protocol) protocol = cand.protocol;
    return normalizeCandidateType(cand?.candidateType);
  };

  const localType = readCandidateType(pair.localCandidateId);
  const remoteType = readCandidateType(pair.remoteCandidateId);
  const rttMs = pair.currentRoundTripTime !== undefined ? Math.round(pair.currentRoundTripTime * 1000) : undefined;

  return {
    localType,
    remoteType,
    currentRoundTripTimeMs: rttMs,
    availableOutgoingBitrate: pair.availableOutgoingBitrate,
    protocol: protocol ?? 'udp',
    bytesSent: pair.bytesSent,
    bytesReceived: pair.bytesReceived,
  };
}
