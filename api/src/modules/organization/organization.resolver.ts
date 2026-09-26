import { Query, Resolver } from '@nestjs/graphql';
import { Capability } from '@taskloom/contracts';
import { DbContext } from '../../platform/database/db-context.js';
import { notFound } from '../../platform/errors/domain-error.js';
import { OrganizationRepository, type OrganizationRow } from './organization.repository.js';

@Resolver('Organization')
export class OrganizationResolver {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly db: DbContext,
  ) {}

  @Query('organization')
  async organization(): Promise<OrganizationRow> {
    this.db.require(Capability.READ_ORG);
    const organization = await this.organizations.findCurrent();
    if (!organization) throw notFound('organization');
    return organization;
  }
}
