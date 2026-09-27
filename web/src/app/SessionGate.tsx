import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import type { ReactNode } from 'react';
import { ErrorState } from '../design-system';
import { useSession } from '../features/auth/hooks/useSession';
import { session } from '../features/auth/session';

/** Holds the app until the session is known (restored from the cookie, or signed out). */
export function SessionGate({ children }: { children: ReactNode }) {
  const state = useSession();
  if (state.status === 'loading') {
    return (
      <Stack role="status" aria-label="Loading Taskloom" sx={{ alignItems: 'center', py: 30 }}>
        <CircularProgress />
      </Stack>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <Container component="main" maxWidth="sm">
        <ErrorState
          title="Taskloom is unavailable"
          message={state.message}
          onRetry={() => void session.restore()}
        />
      </Container>
    );
  }
  return children;
}
