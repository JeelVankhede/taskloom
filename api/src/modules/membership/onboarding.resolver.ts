import { Args, Mutation, ResolveField, Resolver } from '@nestjs/graphql';
import { LENGTH, ORG_SLUG_PATTERN, ORG_SLUG_RESERVED } from '@taskloom/contracts';
import { DbContext } from '../../platform/database/db-context.js';
import { validationFailed } from '../../platform/errors/domain-error.js';
import { assertId } from '../../platform/graphql/ids.js';
import { ActionLimiter } from '../../platform/rate-limit/action-limiter.js';
import type { OrganizationSummary, ViewerJoinRequest } from './membership.types.js';
import { OnboardingRepository } from './onboarding.repository.js';

/** Org-less viewer fields: the organization switcher and the caller's join requests. */
@Resolver('Viewer')
export class OnboardingResolver {
  constructor(private readonly onboarding: OnboardingRepository) {}

  @ResolveField('memberships')
  memberships() {
    return this.onboarding.memberships();
  }

  @ResolveField('joinRequests')
  joinRequests(): Promise<ViewerJoinRequest[]> {
    return this.onboarding.joinRequests();
  }
}

/** Org-less mutations. */
@Resolver()
export class OnboardingMutationResolver {
  constructor(
    private readonly onboarding: OnboardingRepository,
    private readonly limiter: ActionLimiter,
    private readonly db: DbContext,
  ) {}

  @Mutation('createOrganization')
  async createOrganization(
    @Args('input') input: { name: string; slug: string; timezone?: string | null },
  ): Promise<OrganizationSummary> {
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();
    if (name.length < LENGTH.orgName.min || name.length > LENGTH.orgName.max) {
      throw validationFailed(
        `Name must be ${LENGTH.orgName.min} to ${LENGTH.orgName.max} characters`,
      );
    }
    if (!ORG_SLUG_PATTERN.test(slug) || (ORG_SLUG_RESERVED as readonly string[]).includes(slug)) {
      throw validationFailed('Slug must be 3 to 6 lowercase letters or digits, with inner hyphens');
    }
    await this.limiter.hit('org.create', this.db.userId);
    return this.onboarding.createOrganization({ name, slug, timezone: input.timezone ?? 'UTC' });
  }

  @Mutation('requestToJoinOrganization')
  async requestToJoinOrganization(@Args('slug') slug: string): Promise<ViewerJoinRequest> {
    await this.limiter.hit('join.request', this.db.userId);
    return this.onboarding.submitJoinRequest(slug.trim().toLowerCase());
  }

  @Mutation('cancelJoinRequest')
  cancelJoinRequest(@Args('id') id: string): Promise<ViewerJoinRequest> {
    return this.onboarding.cancelJoinRequest(assertId(id, 'join request'));
  }
}
