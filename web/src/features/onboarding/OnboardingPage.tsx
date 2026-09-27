import { EmptyState, PageHeader } from '../../design-system';
import { useSession } from '../auth/hooks/useSession';

/** Placeholder until Phase 8 (create an organization, or request to join one). */
export function OnboardingPage() {
  const state = useSession();
  const name = state.status === 'signedIn' ? state.user.displayName : '';
  return (
    <>
      <PageHeader
        title={`Welcome, ${name}`}
        description="Create an organization, or ask to join one."
      />
      <EmptyState
        title="You are not in an organization yet"
        description="Creating and joining organizations arrives in the next release."
      />
    </>
  );
}
