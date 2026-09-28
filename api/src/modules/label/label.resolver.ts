import { Args, Query, Resolver } from '@nestjs/graphql';
import { Capability } from '@taskloom/contracts';
import { DbContext } from '../../platform/database/db-context.js';
import type { LabelRecord } from '../../platform/loaders/loaders.js';

/** Labels are a plain list: at most 500 live labels per organization (design reference 3). */
@Resolver()
export class LabelResolver {
  constructor(private readonly db: DbContext) {}

  @Query('labels')
  labels(@Args('includeArchived') includeArchived: boolean): Promise<LabelRecord[]> {
    this.db.require(Capability.READ_ORG);
    return this.db.tx.$queryRaw<LabelRecord[]>`
      SELECT id, name, color, archived_at IS NOT NULL AS "isArchived" FROM labels
      WHERE org_id = ${this.db.orgId}::uuid AND (${includeArchived} OR archived_at IS NULL)
      ORDER BY name, id`;
  }
}
