import { EmptyState, PageHeader } from '../../design-system';
import { useOrg } from './org-context';

/** Placeholder until Phase 8 (members, add by email, join requests). */
export function MembersPage() {
  const org = useOrg();
  return (
    <>
      <PageHeader title="Members" description={`People in ${org.name}.`} />
      <EmptyState
        title="Members will appear here"
        description="The members list arrives in the next release."
      />
    </>
  );
}
