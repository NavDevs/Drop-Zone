import { createHmac } from 'node:crypto';
import { ICE_REFRESH_MARGIN_SEC } from '@dropzone/protocol';

export interface IceServerEntry {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceConfigOptions {
  stunUrls: string;
  turnUrls: string;
  turnSecret: string;
  turnTtlSec: number;
  iceServersJson: string;
  now?: () => number;
}

export interface IssuedIce {
  iceServers: IceServerEntry[];
  /** epoch seconds at which the TURN credentials expire */
  turnExpiresAt: number | undefined;
}

/**
 * Computes a coturn `use-auth-secret` (HMAC-SHA1) credential.
 * username = `${expiryUnixSec}:${deviceId}`
 */
export function computeTurnCredential(secret: string, username: string): string {
  return createHmac('sha1', secret).update(username).digest('base64');
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Builds the iceServers list for a device. Honours ICE_SERVERS_JSON override;
 * otherwise issues short-lived TURN credentials when TURN is configured.
 */
export function issueIceServers(deviceId: string, opts: IceConfigOptions): IssuedIce {
  const now = opts.now ?? Date.now;
  if (opts.iceServersJson) {
    try {
      const parsed = JSON.parse(opts.iceServersJson) as IceServerEntry[];
      return { iceServers: parsed, turnExpiresAt: undefined };
    } catch {
      // fall through to env-derived configuration
    }
  }

  const iceServers: IceServerEntry[] = [];
  const stunUrls = splitCsv(opts.stunUrls);
  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  }

  let turnExpiresAt: number | undefined;
  const turnUrls = splitCsv(opts.turnUrls);
  if (turnUrls.length > 0 && opts.turnSecret) {
    const expirySec = Math.floor(now() / 1000) + opts.turnTtlSec;
    const username = `${expirySec}:${deviceId}`;
    const credential = computeTurnCredential(opts.turnSecret, username);
    iceServers.push({ urls: turnUrls, username, credential });
    turnExpiresAt = expirySec;
  }

  return { iceServers, turnExpiresAt };
}

/** Seconds until the issued TURN credentials should be refreshed. */
export function refreshDelaySec(turnExpiresAt: number | undefined, nowMs = Date.now()): number | undefined {
  if (turnExpiresAt === undefined) return undefined;
  return Math.max(1, turnExpiresAt - Math.floor(nowMs / 1000) - ICE_REFRESH_MARGIN_SEC);
}
