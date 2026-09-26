import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ErrorCode } from '@taskloom/contracts';
import { DomainError } from '../../platform/errors/domain-error.js';

export type AuthAction = 'signin' | 'signup' | 'refresh' | 'signout';

export interface AuthLimit {
  /** What the counter is keyed by. */
  by: 'ip' | 'email';
  limit: number;
  windowMs: number;
}

export const AUTH_RATE_LIMITS = Symbol('AUTH_RATE_LIMITS');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Limits agreed in Phase 3. Counters are in memory, correct for one instance. */
export const DEFAULT_AUTH_LIMITS: Record<AuthAction, AuthLimit[]> = {
  signin: [
    { by: 'ip', limit: 10, windowMs: MINUTE },
    { by: 'email', limit: 5, windowMs: MINUTE },
  ],
  signup: [{ by: 'ip', limit: 5, windowMs: HOUR }],
  refresh: [{ by: 'ip', limit: 60, windowMs: MINUTE }],
  signout: [{ by: 'ip', limit: 30, windowMs: MINUTE }],
};

@Injectable()
export class AuthRateLimiter {
  constructor(
    @Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
    @Inject(AUTH_RATE_LIMITS) private readonly limits: Record<AuthAction, AuthLimit[]>,
  ) {}

  async hit(action: AuthAction, keys: { ip: string; email?: string }): Promise<void> {
    for (const rule of this.limits[action]) {
      const value = keys[rule.by];
      if (!value) continue;
      const { isBlocked } = await this.storage.increment(
        `auth:${action}:${rule.by}:${value}`,
        rule.windowMs,
        rule.limit,
        rule.windowMs,
        'auth',
      );
      if (isBlocked) throw new DomainError(ErrorCode.RATE_LIMITED, 'Too many requests');
    }
  }
}
