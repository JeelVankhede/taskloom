import type { AuthSessionBody } from '@taskloom/contracts';
import { ViewerDocument, type ViewerQuery } from '../generated/graphql';

export const user = { id: 'u1', email: 'ada@example.test', displayName: 'Ada Lovelace' };

export const sessionBody = (accessToken = 'token-1'): AuthSessionBody => ({
  accessToken,
  expiresIn: 900,
  user,
});

export const org = (slug: string, name: string) => ({
  role: 'MEMBER' as const,
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
