/**
 * Organization roles and capabilities: the role matrix of docs/1.2-data-model.md section 2.3.
 * The API authorizes with a pure function over this matrix; the web app uses it to hide actions.
 */
export const OrgRole = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  CONTRIBUTOR: 'contributor',
} as const;
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

export const Capability = {
  /** Promote, demote, or remove owners. */
  MANAGE_OWNERS: 'MANAGE_OWNERS',
  /** Org settings, status template, non-owner members, and join requests. */
  MANAGE_ORG: 'MANAGE_ORG',
  /** Create, archive, and restore projects; edit project statuses. */
  MANAGE_PROJECTS: 'MANAGE_PROJECTS',
  /** Create, rename, and archive labels. */
  MANAGE_LABELS: 'MANAGE_LABELS',
  /** Create, edit, move, archive, and restore tasks; apply labels. */
  EDIT_TASKS: 'EDIT_TASKS',
  /** Comment, and edit or delete one's own comments. */
  COMMENT: 'COMMENT',
  /** Delete another member's comment. */
  DELETE_ANY_COMMENT: 'DELETE_ANY_COMMENT',
  /** Read everything in the org. */
  READ_ORG: 'READ_ORG',
} as const;
export type Capability = (typeof Capability)[keyof typeof Capability];

const ALL: readonly OrgRole[] = ['owner', 'admin', 'member', 'contributor'];

export const ROLE_MATRIX: Readonly<Record<Capability, readonly OrgRole[]>> = {
  MANAGE_OWNERS: ['owner'],
  MANAGE_ORG: ['owner', 'admin'],
  MANAGE_PROJECTS: ['owner', 'admin', 'member'],
  MANAGE_LABELS: ['owner', 'admin', 'member'],
  EDIT_TASKS: ALL,
  COMMENT: ALL,
  DELETE_ANY_COMMENT: ['owner', 'admin'],
  READ_ORG: ALL,
};

/** True when the role grants the capability. Pure: never reads the database. */
export function roleCan(role: OrgRole, capability: Capability): boolean {
  return ROLE_MATRIX[capability].includes(role);
}
