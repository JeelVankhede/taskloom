import type { AuthSessionBody, Role } from '@taskloom/contracts';
import {
  OrgMembersDocument,
  OrgProjectsDocument,
  PendingJoinRequestsDocument,
  ViewerDocument,
  type ViewerQuery,
} from '../generated/graphql';

export const user = { id: 'u1', email: 'ada@example.test', displayName: 'Ada Lovelace' };

export const sessionBody = (accessToken = 'token-1'): AuthSessionBody => ({
  accessToken,
  expiresIn: 900,
  user,
});

export const org = (slug: string, name: string, role: Role = 'MEMBER') => ({
  role,
  organization: { __typename: 'OrganizationSummary' as const, id: `org-${slug}`, slug, name },
  __typename: 'Membership' as const,
});

export function viewerMock(memberships: ViewerQuery['viewer']['memberships']) {
  return {
    request: { query: ViewerDocument },
    result: {
      data: { viewer: { __typename: 'Viewer' as const, ...user, memberships } },
    },
  };
}

const page = <T>(nodes: T[], hasNextPage = false) => ({
  __typename: 'PageInfo' as const,
  hasNextPage,
  endCursor: hasNextPage ? `cursor-${nodes.length}` : null,
});

export const project = (key: string, name: string, description: string | null = null) => ({
  __typename: 'Project' as const,
  id: `project-${key}`,
  key,
  name,
  description,
});

/** The org-scoped projects query for an organization id, first page. */
export function projectsMock(orgId: string, projects: ReturnType<typeof project>[], delay = 0) {
  return {
    request: { query: OrgProjectsDocument, variables: { first: 50 } },
    delay,
    result: {
      data: {
        organization: {
          __typename: 'Organization' as const,
          id: orgId,
          projects: {
            __typename: 'ProjectConnection' as const,
            edges: projects.map((node) => ({
              __typename: 'ProjectEdge' as const,
              cursor: node.id,
              node,
            })),
            pageInfo: page(projects),
          },
        },
      },
    },
  };
}

export const person = (id: string, displayName: string, email: string | null = null) => ({
  __typename: 'User' as const,
  id,
  displayName,
  email,
});

export const member = (
  user: ReturnType<typeof person>,
  role: Role = 'MEMBER',
  status: 'ACTIVE' | 'DEACTIVATED' = 'ACTIVE',
) => ({
  __typename: 'Member' as const,
  role,
  status,
  joinedAt: '2026-09-01T10:00:00.000Z',
  user,
});

export function membersMock(orgId: string, members: ReturnType<typeof member>[]) {
  return {
    request: { query: OrgMembersDocument, variables: { first: 50 } },
    result: {
      data: {
        organization: {
          __typename: 'Organization' as const,
          id: orgId,
          members: {
            __typename: 'MemberConnection' as const,
            edges: members.map((node) => ({
              __typename: 'MemberEdge' as const,
              cursor: node.user.id,
              node,
            })),
            pageInfo: page(members),
          },
        },
      },
    },
  };
}

export const joinRequest = (id: string, user: ReturnType<typeof person>) => ({
  __typename: 'JoinRequest' as const,
  id,
  createdAt: '2026-09-20T10:00:00.000Z',
  user,
});

export function pendingMock(orgId: string, requests: ReturnType<typeof joinRequest>[]) {
  return {
    request: { query: PendingJoinRequestsDocument, variables: { first: 50 } },
    result: {
      data: {
        organization: {
          __typename: 'Organization' as const,
          id: orgId,
          joinRequests: {
            __typename: 'JoinRequestConnection' as const,
            edges: requests.map((node) => ({
              __typename: 'JoinRequestEdge' as const,
              cursor: node.id,
              node,
            })),
            pageInfo: page(requests),
          },
        },
      },
    },
  };
}
