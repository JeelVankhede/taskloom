import { Injectable } from '@nestjs/common';
import { DbContext } from '../../platform/database/db-context.js';

export interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
}

@Injectable()
export class OrganizationRepository {
  constructor(private readonly db: DbContext) {}

  /** Row-level security already limits this to the selected org. */
  findCurrent(): Promise<OrganizationRow | null> {
    return this.db.tx.organization.findUnique({
      where: { id: this.db.orgId },
      select: { id: true, slug: true, name: true },
    });
  }
}
