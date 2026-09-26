import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ErrorCode } from '@taskloom/contracts';
import { DomainError } from '../errors/domain-error.js';

export type LimitedAction = 'org.create' | 'join.request' | 'member.lookup';

export interface ActionLimit {
  limit: number;
  windowMs: number;
}

export const ACTION_LIMITS = Symbol('ACTION_LIMITS');

const HOUR = 3_600_000;

/** Phase 4 limits. In memory: correct for one instance, reset on restart (accepted). */
export const DEFAULT_ACTION_LIMITS: Record<LimitedAction, ActionLimit> = {
  /** Per user. */
  'org.create': { limit: 5, windowMs: 24 * HOUR },
  /** Per user. */
  'join.request': { limit: 10, windowMs: HOUR },
  /** Per organization (design reference section 2). */
  'member.lookup': { limit: 30, windowMs: HOUR },
};

@Injectable()
export class ActionLimiter {
  constructor(
    @Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
    @Inject(ACTION_LIMITS) private readonly limits: Record<LimitedAction, ActionLimit>,
  ) {}

  async hit(action: LimitedAction, key: string): Promise<void> {
    const { limit, windowMs } = this.limits[action];
    const { isBlocked } = await this.storage.increment(
      `action:${action}:${key}`,
      windowMs,
      limit,
      windowMs,
      'action',
    );
    if (isBlocked) throw new DomainError(ErrorCode.RATE_LIMITED, 'Too many requests');
  }
}
