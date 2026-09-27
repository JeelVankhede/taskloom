import Stack from '@mui/material/Stack';
import { Card, PageHeader } from '../../design-system';
import { useSession } from '../auth/hooks/useSession';
import { CreateOrgForm } from './components/CreateOrgForm';
import { JoinOrgForm } from './components/JoinOrgForm';
import { MyJoinRequests } from './components/MyJoinRequests';

/** /onboarding: create an organization, or ask to join one, and follow those requests. */
export function OnboardingPage() {
  const state = useSession();
  const name = state.status === 'signedIn' ? state.user.displayName : '';
  return (
    <>
      <PageHeader
        title={`Welcome, ${name}`}
        description="Create an organization for your team, or ask to join one that exists."
      />
      <Stack spacing={8}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} sx={{ alignItems: 'stretch' }}>
          <Stack sx={{ flex: 1 }}>
            <Card title="Create an organization">
              <CreateOrgForm />
            </Card>
          </Stack>
          <Stack sx={{ flex: 1 }}>
            <Card title="Join an organization">
              <JoinOrgForm />
            </Card>
          </Stack>
        </Stack>
        <MyJoinRequests />
      </Stack>
    </>
  );
}
