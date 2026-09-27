import { useQuery } from '@apollo/client/react';
import { ViewerDocument } from '../../generated/graphql';

/** The viewer and their memberships. One cached query shared by the shell and the org route. */
export function useViewer() {
  return useQuery(ViewerDocument);
}
