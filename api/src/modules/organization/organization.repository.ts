import { Injectable } from '@nestjs/common';
import { DbContext } from '../../platform/database/db-context.js';

export interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
  /** IANA name; "today" and overdue are decided in this timezone. */
  timezone: string;
}

@Injectable()
export class OrganizationRepository {
  constructor(private readonly db: DbContext) {}

  /** Row-level security already limits this to the selected org. One statement with its settings. */
  async findCurrent(): Promise<OrganizationRow | null> {
    const [row] = await this.db.tx.$queryRaw<OrganizationRow[]>`
      SELECT o.id, o.slug::text AS slug, o.name, s.timezone
      FROM organizations o
      JOIN organization_settings s ON s.org_id = o.id
      WHERE o.id = ${this.db.orgId}::uuid`;
    return row ?? null;
  }
}
