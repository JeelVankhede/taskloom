import { Args, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Capability, type OrgRole } from '@taskloom/contracts';
import { DbContext } from '../../platform/database/db-context.js';
import { assertId } from '../../platform/graphql/ids.js';
import { Loaders } from '../../platform/loaders/loaders.js';
import {
  type Connection,
  decodeCursor,
  pageSize,
  toConnection,
} from '../../platform/pagination/connection.js';
import {
  type JoinRequestRow,
  MembershipRepository,
  type MemberRow,
} from './membership.repository.js';
import { MembershipService } from './membership.service.js';
import type { JoinRequestNode, JoinRequestStatus, MemberNode } from './membership.types.js';

@Resolver('Organization')
export class OrganizationMembershipResolver {
  constructor(
    private readonly repo: MembershipRepository,
    private readonly db: DbContext,
  ) {}

  @ResolveField('members')
  async members(
    @Args('first') first: number | null,
    @Args('after') after: string | null,
  ): Promise<Connection<MemberRow>> {
    this.db.require(Capability.READ_ORG);
    const size = pageSize(first);
    const cursor = after ? decodeCursor(after, ['string', 'string']) : undefined;
    const rows = await this.repo.listMembers(
      size + 1,
      cursor ? { name: cursor[0] as string, userId: cursor[1] as string } : undefined,
    );
    return toConnection(rows, size, (row) => [row.displayName, row.userId]);
  }

  @ResolveField('joinRequests')
  async joinRequests(
    @Args('status') status: JoinRequestStatus,
    @Args('first') first: number | null,
    @Args('after') after: string | null,
  ): Promise<Connection<JoinRequestRow>> {
    this.db.require(Capability.MANAGE_ORG);
    const size = pageSize(first);
    const cursor = after ? decodeCursor(after, ['string', 'string']) : undefined;
    const rows = await this.repo.listJoinRequests(
      status,
      size + 1,
      cursor ? { createdAt: cursor[0] as string, id: cursor[1] as string } : undefined,
    );
    return toConnection(rows, size, (row) => [row.createdAtKey, row.id]);
  }
}

@Resolver()
export class MembershipMutationResolver {
  constructor(private readonly memberships: MembershipService) {}

  @Mutation('approveJoinRequest')
  approveJoinRequest(@Args('id') id: string, @Args('role') role: OrgRole): Promise<MemberNode> {
    return this.memberships.approve(assertId(id, 'join request'), role);
  }

  @Mutation('rejectJoinRequest')
  rejectJoinRequest(@Args('id') id: string): Promise<JoinRequestNode> {
    return this.memberships.reject(assertId(id, 'join request'));
  }

  @Mutation('addMember')
  addMember(@Args('email') email: string, @Args('role') role: OrgRole): Promise<MemberNode> {
    return this.memberships.addByEmail(email, role);
  }
}

@Resolver('Member')
export class MemberResolver {
  constructor(private readonly loaders: Loaders) {}

  @ResolveField('user')
  user(@Parent() member: MemberNode) {
    return this.loaders.user(member.userId);
  }
}

@Resolver('JoinRequest')
export class JoinRequestResolver {
  constructor(private readonly loaders: Loaders) {}

  @ResolveField('user')
  user(@Parent() request: JoinRequestNode) {
    return this.loaders.user(request.userId);
  }

  @ResolveField('decidedBy')
  decidedBy(@Parent() request: JoinRequestNode) {
    return request.decidedById ? this.loaders.user(request.decidedById) : null;
  }
}
