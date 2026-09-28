import { EmptyState, PageHeader } from '../../design-system';
import { useOrg } from './org-context';

/** Placeholder until Phase 8 (projects and create project). */
export function DashboardPage() {
  const org = useOrg();
  return (
    <>
      <PageHeader title={org.name} description="Projects in this organization." />
      <EmptyState
        title="Projects will appear here"
        description="The project list arrives in the next release."
      />
    </>
  );
}
