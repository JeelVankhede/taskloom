import type { OrgRole } from '@taskloom/contracts';

export type MembershipStatus = 'active' | 'deactivated';
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'canceled';

export interface OrganizationSummary {
  id: string;
  slug: string;
  name: string;
}

export interface ViewerJoinRequest {
  id: string;
  organization: OrganizationSummary;
  status: JoinRequestStatus;
  createdAt: Date;
  decidedAt: Date | null;
}

/** A membership as a GraphQL Member; `user` resolves through the user loader. */
export interface MemberNode {
  userId: string;
  role: OrgRole;
  status: MembershipStatus;
  joinedAt: Date;
}

export interface JoinRequestNode {
  id: string;
  userId: string;
  status: JoinRequestStatus;
  createdAt: Date;
  decidedAt: Date | null;
  decidedById: string | null;
}
