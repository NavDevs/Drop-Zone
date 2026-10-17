import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { RateLimiterRes } from 'rate-limiter-flexible';
import {
  ROOM_CREATE_RATE_LIMIT,
  ROOM_CREATE_RATE_WINDOW_SEC,
  ROOM_JOIN_RATE_LIMIT,
  ROOM_JOIN_RATE_WINDOW_SEC,
  JOIN_FAIL_LOCKOUT_THRESHOLD,
  JOIN_FAIL_LOCKOUT_SEC,
  SIGNAL_RATE_LIMIT,
  SIGNAL_RATE_WINDOW_SEC,
} from '@dropzone/protocol';

export interface LimitPolicy {
  roomCreateCount: number;
  roomCreateWindowSec: number;
  roomJoinCount: number;
  roomJoinWindowSec: number;
  joinFailThreshold: number;
  joinFailLockoutSec: number;
  signalCount: number;
  signalWindowSec: number;
}

export const DEFAULT_LIMIT_POLICY: LimitPolicy = {
  roomCreateCount: ROOM_CREATE_RATE_LIMIT,
  roomCreateWindowSec: ROOM_CREATE_RATE_WINDOW_SEC,
  roomJoinCount: ROOM_JOIN_RATE_LIMIT,
  roomJoinWindowSec: ROOM_JOIN_RATE_WINDOW_SEC,
  joinFailThreshold: JOIN_FAIL_LOCKOUT_THRESHOLD,
  joinFailLockoutSec: JOIN_FAIL_LOCKOUT_SEC,
  signalCount: SIGNAL_RATE_LIMIT,
  signalWindowSec: SIGNAL_RATE_WINDOW_SEC,
};

export type LimitedLimiter = 'room-create' | 'room-join' | 'join-fail' | 'signal';

export interface LimitsResult {
  allowed: boolean;
  limiter?: LimitedLimiter;
}

/**
 * In-memory rate limiters keyed by IP (room create/join) or socket id (signal).
 * Failed joins accumulate toward a temporary lockout.
 */
export class Limits {
  private readonly roomCreate: RateLimiterMemory;
  private readonly roomJoin: RateLimiterMemory;
  private readonly joinFail: RateLimiterMemory;
  private readonly signal: RateLimiterMemory;

  constructor(policy: LimitPolicy = DEFAULT_LIMIT_POLICY) {
    this.roomCreate = new RateLimiterMemory({
      points: policy.roomCreateCount,
      duration: policy.roomCreateWindowSec,
    });
    this.roomJoin = new RateLimiterMemory({
      points: policy.roomJoinCount,
      duration: policy.roomJoinWindowSec,
    });
    this.joinFail = new RateLimiterMemory({
      points: policy.joinFailThreshold,
      duration: policy.joinFailLockoutSec,
    });
    this.signal = new RateLimiterMemory({
      points: policy.signalCount,
      duration: policy.signalWindowSec,
    });
  }

  private static async consume(limiter: RateLimiterMemory, key: string): Promise<boolean> {
    try {
      await limiter.consume(key);
      return true;
    } catch {
      return false;
    }
  }

  /** Attempt to spend one room-creation token for an IP. */
  async tryRoomCreate(ip: string): Promise<LimitsResult> {
    const ok = await Limits.consume(this.roomCreate, ip);
    return ok ? { allowed: true } : { allowed: false, limiter: 'room-create' };
  }

  /** Attempt to spend one room-join token for an IP; blocked if lockout active. */
  async tryRoomJoin(ip: string): Promise<LimitsResult> {
    const res = await this.joinFail.get(ip);
    if (res && res.remainingPoints <= 0) {
      return { allowed: false, limiter: 'join-fail' };
    }
    const ok = await Limits.consume(this.roomJoin, ip);
    return ok ? { allowed: true } : { allowed: false, limiter: 'room-join' };
  }

  /** Record a failed join attempt toward the lockout threshold. */
  async recordJoinFailure(ip: string): Promise<void> {
    try {
      await this.joinFail.consume(ip);
    } catch {
      // threshold reached — lockout now enforced by tryRoomJoin
    }
  }

  /** Attempt to spend one signal token for a socket. */
  async trySignal(socketId: string): Promise<LimitsResult> {
    const ok = await Limits.consume(this.signal, socketId);
    return ok ? { allowed: true } : { allowed: false, limiter: 'signal' };
  }
}

export function extractIp(remote: string | undefined): string {
  if (!remote) return 'unknown';
  // strip IPv6-mapped IPv4 prefix and port
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)/.exec(remote);
  if (m?.[1]) return m[1];
  return remote.replace(/^::1$/, '127.0.0.1');
}

export function remainingMs(res: RateLimiterRes | null): number | undefined {
  return res ? res.msBeforeNext : undefined;
}
