import { Injectable } from '@nestjs/common';
import { Capability, ErrorCode, normalizeEmail, type OrgRole } from '@taskloom/contracts';
import { DbContext } from '../../platform/database/db-context.js';
import { DomainError, forbidden, notFound } from '../../platform/errors/domain-error.js';
import { ActivityRecorder } from '../../platform/history/activity-recorder.js';
import { ActionLimiter } from '../../platform/rate-limit/action-limiter.js';
import { type JoinRequestRow, MembershipRepository } from './membership.repository.js';
import type { MemberNode } from './membership.types.js';

/**
 * Who gets into an organization. Owners and admins decide (MANAGE_ORG); OWNER is never
 * granted this way. Every decision writes its event in the same transaction.
 */
@Injectable()
export class MembershipService {
  constructor(
    private readonly repo: MembershipRepository,
    private readonly activity: ActivityRecorder,
    private readonly limiter: ActionLimiter,
    private readonly db: DbContext,
  ) {}

  async approve(requestId: string, role: OrgRole): Promise<MemberNode> {
    this.assertCanGrant(role);
    const request = await this.pendingRequest(requestId);
    const member = await this.admit(request.userId, role);
    await this.repo.decideJoinRequest(requestId, 'approved');
    await this.activity.record('member.added', {
      user_id: request.userId,
      role,
      via: 'join_request',
      request_id: requestId,
    });
    return member;
  }

  async reject(requestId: string): Promise<JoinRequestRow> {
    this.db.require(Capability.MANAGE_ORG);
    const request = await this.pendingRequest(requestId);
    const decided = await this.repo.decideJoinRequest(requestId, 'rejected');
    await this.activity.record('member.join_request_rejected', {
      user_id: request.userId,
      request_id: requestId,
    });
    return decided;
  }

  async addByEmail(email: string, role: OrgRole): Promise<MemberNode> {
    this.assertCanGrant(role);
    await this.limiter.hit('member.lookup', this.db.orgId);
    const userId = await this.repo.lookupUserId(normalizeEmail(email));
    if (!userId) throw new DomainError(ErrorCode.NOT_FOUND, 'No account with that email');

    const member = await this.admit(userId, role);
    const requestId = await this.repo.approvePendingRequestOf(userId);
    await this.activity.record('member.added', {
      user_id: userId,
      role,
      via: 'direct',
      ...(requestId ? { request_id: requestId } : {}),
    });
    return member;
  }

  /** Inserts the membership, or reactivates a deactivated one with the chosen role. */
  private async admit(userId: string, role: OrgRole): Promise<MemberNode> {
    const existing = await this.repo.lockMembership(userId);
    if (existing?.status === 'active') {
      throw new DomainError(ErrorCode.ALREADY_MEMBER, 'Already a member of this organization');
    }
    return existing
      ? this.repo.reactivateMembership(userId, role)
      : this.repo.insertMembership(userId, role);
  }

  private async pendingRequest(id: string): Promise<JoinRequestRow> {
    this.db.require(Capability.MANAGE_ORG);
    const request = await this.repo.lockJoinRequest(id);
    if (!request) throw notFound('join request');
    if (request.status !== 'pending') {
      throw new DomainError(
        ErrorCode.JOIN_REQUEST_NOT_PENDING,
        'This request has already been decided',
      );
    }
    return request;
  }

  private assertCanGrant(role: OrgRole): void {
    this.db.require(Capability.MANAGE_ORG);
    if (role === 'owner') throw forbidden();
  }
}
