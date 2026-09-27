import type { Role } from '@taskloom/contracts';
import { createContext, useContext } from 'react';

export interface CurrentOrg {
  id: string;
  slug: string;
  name: string;
  role: Role;
}

export const OrgContext = createContext<CurrentOrg | null>(null);

/** The organization of the current /o/:orgSlug route. */
export function useOrg(): CurrentOrg {
  const org = useContext(OrgContext);
  if (!org) throw new Error('useOrg must be used under an /o/:orgSlug route');
  return org;
}

/**
 * The Apollo context for an org-scoped operation: the link sends it as X-Org-Id. Passed per
 * operation (not held globally) so an operation always runs in the org it was made for.
 */
export function useOrgOperationContext(): { orgId: string } {
  return { orgId: useOrg().id };
}
