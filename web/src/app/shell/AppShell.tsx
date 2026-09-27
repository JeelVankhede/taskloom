import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Toolbar from '@mui/material/Toolbar';
import { useEffect, useRef } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router';
import { useSession } from '../../features/auth/hooks/useSession';
import { OrgSwitcher } from './OrgSwitcher';
import { UserMenu } from './UserMenu';

/** The signed-in frame: top bar with the org switcher and account menu, content below. */
export function AppShell() {
  const state = useSession();
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // After client-side navigation, move focus to the new page so screen readers announce it.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus();
  }, [pathname]);

  if (state.status !== 'signedIn') return null;
  return (
    <>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 3 }}>
          <Link
            component={RouterLink}
            to="/"
            underline="none"
            variant="h4"
            color="primary"
            sx={{ mr: 1 }}
          >
            Taskloom
          </Link>
          <OrgSwitcher />
          <Box sx={{ flexGrow: 1 }} />
          <UserMenu user={state.user} />
        </Toolbar>
      </AppBar>
      <Container
        component="main"
        ref={main}
        tabIndex={-1}
        maxWidth="lg"
        sx={{ py: 8, outline: 'none' }}
      >
        <Outlet />
      </Container>
    </>
  );
}
