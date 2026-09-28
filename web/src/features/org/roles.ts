import { type Capability, type OrgRole, type Role, roleCan } from '@taskloom/contracts';

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  CONTRIBUTOR: 'Contributor',
};

/** Roles an owner or admin can grant. Nobody grants OWNER by adding or approving. */
export const GRANTABLE_ROLES: readonly Role[] = ['ADMIN', 'MEMBER', 'CONTRIBUTOR'];

/** The shared role matrix, for a GraphQL role. Hides actions the API would refuse anyway. */
export const can = (role: Role, capability: Capability): boolean =>
  roleCan(role.toLowerCase() as OrgRole, capability);
