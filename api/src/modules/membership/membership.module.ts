import { Module } from '@nestjs/common';
import {
  JoinRequestResolver,
  MemberResolver,
  MembershipMutationResolver,
  OrganizationMembershipResolver,
} from './membership.resolver.js';
import { MembershipRepository } from './membership.repository.js';
import { MembershipService } from './membership.service.js';
import { OnboardingRepository } from './onboarding.repository.js';
import { OnboardingMutationResolver, OnboardingResolver } from './onboarding.resolver.js';

/** Organization creation, join requests, and membership decisions. */
@Module({
  providers: [
    OnboardingRepository,
    OnboardingResolver,
    OnboardingMutationResolver,
    MembershipRepository,
    MembershipService,
    OrganizationMembershipResolver,
    MembershipMutationResolver,
    MemberResolver,
    JoinRequestResolver,
  ],
})
export class MembershipModule {}
