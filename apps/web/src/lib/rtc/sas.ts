import { createSHA256 } from 'hash-wasm';

/**
 * Extracts the DTLS sha-256 fingerprint from an SDP string (TRD §7).
 */
export function extractFingerprint(sdp: string): string | null {
  const match = sdp.match(/a=fingerprint:sha-256\s+([0-9A-Fa-f:]+)/i);
  return match?.[1] ? match[1].toUpperCase() : null;
}

/**
 * Computes the 6-digit Short Authentication String (SAS) between local and remote SDPs (TRD §7).
 * Both peers compute the identical SAS independently without trust in the signaling channel:
 * 1. Extract fingerprint strings from local and remote SDPs
 * 2. Sort lexicographically
 * 3. Concatenate and SHA-256 hash
 * 4. First 4 bytes mod 10^6 formatted as a 6-digit string "XXX YYY"
 */
export async function computeSas(localSdp: string, remoteSdp: string): Promise<string | null> {
  const fpLocal = extractFingerprint(localSdp);
  const fpRemote = extractFingerprint(remoteSdp);

  if (!fpLocal || !fpRemote) return null;

  const sorted = [fpLocal, fpRemote].sort();
  const concatenated = `${sorted[0]}|${sorted[1]}`;

  const hasher = await createSHA256();
  hasher.init();
  hasher.update(new TextEncoder().encode(concatenated));
  const hex = hasher.digest();

  // Parse first 4 bytes (8 hex characters)
  const num = parseInt(hex.slice(0, 8), 16);
  const code = (num % 1_000_000).toString().padStart(6, '0');

  // Format as "XXX YYY"
  return `${code.slice(0, 3)} ${code.slice(3, 6)}`;
}
