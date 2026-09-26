import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { DbContext } from '../../platform/database/db-context.js';
import type { UserRecord } from '../../platform/loaders/loaders.js';

/**
 * User.email is visible to the user and to owners and admins of the current org, and null
 * for everyone else (design reference 7.3.9). Row-level security decides which users exist.
 */
@Resolver('User')
export class UserResolver {
  constructor(private readonly db: DbContext) {}

  @ResolveField('email')
  email(@Parent() user: UserRecord): string | null {
    return user.id === this.db.userId || this.db.isOrgManager ? user.email : null;
  }
}
