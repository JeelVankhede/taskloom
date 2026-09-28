import type { OperationVariables, TypedDocumentNode } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useOrgOperationContext } from '../org-context';

/**
 * Queries that run in the current organization (X-Org-Id).
 *
 * The schema's `organization` root field takes no arguments (the header picks the org), so the
 * cache stores every organization under the same Query.organization key. To never show one
 * organization's data in another: the org routes remount when the org changes (OrgLayout keys
 * them by id), and the first read after a mount goes to the network; later reads (pagination,
 * re-renders) use the cache, which is normalized by organization id.
 */
export function useOrgQuery<TData, TVariables extends OperationVariables>(
  document: TypedDocumentNode<TData, TVariables>,
  variables: NoInfer<TVariables>,
  options: {
    skip?: boolean;
    /** Show cached data for new variables at once, but also refresh it (board filters). */
    refreshOnNewVariables?: boolean;
  } = {},
) {
  const context = useOrgOperationContext();
  return useQuery(document, {
    variables,
    context,
    skip: options.skip,
    fetchPolicy: 'network-only',
    nextFetchPolicy: (_current, { reason }) =>
      options.refreshOnNewVariables && reason === 'variables-changed'
        ? 'cache-and-network'
        : 'cache-first',
    notifyOnNetworkStatusChange: true,
  });
}

/** Mutations that run in the current organization. */
export function useOrgMutation<TData, TVariables extends OperationVariables>(
  document: TypedDocumentNode<TData, TVariables>,
) {
  const context = useOrgOperationContext();
  return useMutation(document, { context });
}
