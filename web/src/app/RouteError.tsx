import Container from '@mui/material/Container';
import { useEffect } from 'react';
import { isRouteErrorResponse, useLocation, useRouteError } from 'react-router';
import { ErrorState } from '../design-system';
import { NotFound } from './NotFound';

/**
 * The error boundary on every route: a crash in one screen shows this in place of that screen,
 * and the rest of the app (top bar, other routes) keeps working. Logged without user data.
 */
export function RouteError() {
  const error = useRouteError();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isRouteErrorResponse(error)) {
      console.error('Route crashed', { route: pathname, error });
    }
  }, [error, pathname]);

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  return (
    <Container maxWidth="sm">
      <ErrorState
        title="This page failed to load"
        message="Something went wrong while showing this page. Reloading usually fixes it."
        onRetry={() => window.location.reload()}
      />
    </Container>
  );
}
