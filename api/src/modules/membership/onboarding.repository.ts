import { Injectable } from '@nestjs/common';
import type { OrgRole } from '@taskloom/contracts';
import { DbContext } from '../../platform/database/db-context.js';
import type {
  JoinRequestStatus,
  OrganizationSummary,
  ViewerJoinRequest,
} from './membership.types.js';

interface JoinRequestFnRow {
  id: string;
  org_id: string;
  org_slug: string;
  org_name: string;
  status: JoinRequestStatus;
  created_at: Date;
  decided_at: Date | null;
}

const toViewerJoinRequest = (row: JoinRequestFnRow): ViewerJoinRequest => ({
  id: row.id,
  organization: { id: row.org_id, slug: row.org_slug, name: row.org_name },
  status: row.status,
  createdAt: row.created_at,
  decidedAt: row.decided_at,
});

/**
 * Org-less operations. Each crossing goes through a definer function owned by a role that
 * cannot log in (design reference section 2); nothing here reads tenant tables directly.
 */
@Injectable()
export class OnboardingRepository {
  constructor(private readonly db: DbContext) {}

  async memberships(): Promise<{ organization: OrganizationSummary; role: OrgRole }[]> {
    const rows = await this.db.tx.$queryRaw<
      { org_id: string; slug: string; name: string; role: OrgRole }[]
    >`
      SELECT org_id, slug, name, role FROM app.viewer_memberships()`;
    return rows.map((row) => ({
      organization: { id: row.org_id, slug: row.slug, name: row.name },
      role: row.role,
    }));
  }

  async joinRequests(): Promise<ViewerJoinRequest[]> {
    const rows = await this.db.tx.$queryRaw<
      JoinRequestFnRow[]
    >`SELECT * FROM app.viewer_join_requests()`;
    return rows.map(toViewerJoinRequest);
  }

  async submitJoinRequest(slug: string): Promise<ViewerJoinRequest> {
    const [row] = await this.db.tx.$queryRaw<
      JoinRequestFnRow[]
    >`SELECT * FROM app.submit_join_request(${slug})`;
    return toViewerJoinRequest(row!);
  }

  async cancelJoinRequest(id: string): Promise<ViewerJoinRequest> {
    const [row] = await this.db.tx.$queryRaw<
      JoinRequestFnRow[]
    >`SELECT * FROM app.cancel_join_request(${id}::uuid)`;
    return toViewerJoinRequest(row!);
  }

  /** app.create_organization sets its own tenant context, so the new org is readable after. */
  async createOrganization(input: {
    name: string;
    slug: string;
    timezone: string;
  }): Promise<OrganizationSummary> {
    const [created] = await this.db.tx.$queryRaw<{ id: string }[]>`
      SELECT app.create_organization(${input.name}, ${input.slug}, ${input.timezone})::text AS id`;
    const [org] = await this.db.tx.$queryRaw<OrganizationSummary[]>`
      SELECT id, slug::text AS slug, name FROM organizations WHERE id = ${created!.id}::uuid`;
    return org!;
  }
}
