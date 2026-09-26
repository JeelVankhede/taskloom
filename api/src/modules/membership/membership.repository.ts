import { Injectable } from '@nestjs/common';
import type { OrgRole } from '@taskloom/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { DbContext } from '../../platform/database/db-context.js';
import type {
  JoinRequestNode,
  JoinRequestStatus,
  MemberNode,
  MembershipStatus,
} from './membership.types.js';

export interface MemberRow extends MemberNode {
  /** Sort key for the members connection. */
  displayName: string;
}

export interface JoinRequestRow extends JoinRequestNode {
  /** created_at as text, so the cursor keeps full microsecond precision. */
  createdAtKey: string;
}

const MEMBER_COLUMNS = Prisma.sql`
  m.user_id AS "userId", m.role, m.status, m.created_at AS "joinedAt", u.display_name AS "displayName"`;

const REQUEST_COLUMNS = Prisma.sql`
  r.id, r.user_id AS "userId", r.status, r.created_at AS "createdAt", r.decided_at AS "decidedAt",
  r.decided_by AS "decidedById", r.created_at::text AS "createdAtKey"`;

@Injectable()
export class MembershipRepository {
  constructor(private readonly db: DbContext) {}

  /** Members in any status, by display name then user id. */
  listMembers(limit: number, after?: { name: string; userId: string }): Promise<MemberRow[]> {
    const cursor = after
      ? Prisma.sql`AND (u.display_name, m.user_id) > (${after.name}, ${after.userId}::uuid)`
      : Prisma.empty;
    return this.db.tx.$queryRaw<MemberRow[]>`
      SELECT ${MEMBER_COLUMNS}
      FROM org_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ${this.db.orgId}::uuid ${cursor}
      ORDER BY u.display_name, m.user_id
      LIMIT ${limit}`;
  }

  /** Oldest first. */
  listJoinRequests(
    status: JoinRequestStatus,
    limit: number,
    after?: { createdAt: string; id: string },
  ): Promise<JoinRequestRow[]> {
    const cursor = after
      ? Prisma.sql`AND (r.created_at, r.id) > (${after.createdAt}::timestamptz, ${after.id}::uuid)`
      : Prisma.empty;
    return this.db.tx.$queryRaw<JoinRequestRow[]>`
      SELECT ${REQUEST_COLUMNS}
      FROM org_join_requests r
      WHERE r.org_id = ${this.db.orgId}::uuid AND r.status = ${status}::join_request_status ${cursor}
      ORDER BY r.created_at, r.id
      LIMIT ${limit}`;
  }

  /** Locks the request row, so two admins deciding at once serialize here. */
  async lockJoinRequest(id: string): Promise<JoinRequestRow | undefined> {
    const [row] = await this.db.tx.$queryRaw<JoinRequestRow[]>`
      SELECT ${REQUEST_COLUMNS} FROM org_join_requests r
      WHERE r.org_id = ${this.db.orgId}::uuid AND r.id = ${id}::uuid
      FOR UPDATE`;
    return row;
  }

  async decideJoinRequest(id: string, status: 'approved' | 'rejected'): Promise<JoinRequestRow> {
    const [row] = await this.db.tx.$queryRaw<JoinRequestRow[]>`
      UPDATE org_join_requests r
      SET status = ${status}::join_request_status, decided_at = now(), decided_by = ${this.db.userId}::uuid
      WHERE r.org_id = ${this.db.orgId}::uuid AND r.id = ${id}::uuid
      RETURNING ${REQUEST_COLUMNS}`;
    return row!;
  }

  /** Marks the user's pending request approved (an admin added them directly). Returns its id. */
  async approvePendingRequestOf(userId: string): Promise<string | undefined> {
    const [row] = await this.db.tx.$queryRaw<{ id: string }[]>`
      UPDATE org_join_requests
      SET status = 'approved', decided_at = now(), decided_by = ${this.db.userId}::uuid
      WHERE org_id = ${this.db.orgId}::uuid AND user_id = ${userId}::uuid AND status = 'pending'
      RETURNING id`;
    return row?.id;
  }

  /** The membership row, locked, or undefined when the user was never a member. */
  async lockMembership(userId: string): Promise<{ status: MembershipStatus } | undefined> {
    const [row] = await this.db.tx.$queryRaw<{ status: MembershipStatus }[]>`
      SELECT status FROM org_memberships
      WHERE org_id = ${this.db.orgId}::uuid AND user_id = ${userId}::uuid
      FOR UPDATE`;
    return row;
  }

  async insertMembership(userId: string, role: OrgRole): Promise<MemberNode> {
    const [row] = await this.db.tx.$queryRaw<MemberNode[]>`
      INSERT INTO org_memberships (org_id, user_id, role, status)
      VALUES (${this.db.orgId}::uuid, ${userId}::uuid, ${role}::org_role, 'active')
      RETURNING user_id AS "userId", role, status, created_at AS "joinedAt"`;
    return row!;
  }

  async reactivateMembership(userId: string, role: OrgRole): Promise<MemberNode> {
    const [row] = await this.db.tx.$queryRaw<MemberNode[]>`
      UPDATE org_memberships SET role = ${role}::org_role, status = 'active', deactivated_at = NULL
      WHERE org_id = ${this.db.orgId}::uuid AND user_id = ${userId}::uuid
      RETURNING user_id AS "userId", role, status, created_at AS "joinedAt"`;
    return row!;
  }

  /** Exact email, id only, through the app_identity definer function (T33). */
  async lookupUserId(email: string): Promise<string | null> {
    const [row] = await this.db.tx.$queryRaw<{ id: string | null }[]>`
      SELECT app.lookup_user_id_by_email(${email})::text AS id`;
    return row?.id ?? null;
  }
}
