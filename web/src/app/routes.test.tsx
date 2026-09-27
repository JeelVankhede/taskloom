import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetSessionForTests, session } from '../features/auth/session';
import { org, sessionBody, viewerMock } from '../test/fixtures';
import { renderApp } from '../test/render';

const acme = org('acme', 'Acme');
const globex = org('globex', 'Globex');

beforeEach(() => {
  resetSessionForTests();
  localStorage.clear();
});

describe('guards', () => {
  it('sends a signed-out visitor to sign in, remembering where they were going', async () => {
    session.clear({ reason: 'none', broadcast: false });
    const router = renderApp('/o/acme/members');
    await waitFor(() => expect(router.state.location.pathname).toBe('/signin'));
    expect(router.state.location.search).toBe('?next=%2Fo%2Facme%2Fmembers');
  });

  it('does not keep the page after a deliberate sign out', async () => {
    session.clear({ reason: 'ended', broadcast: false });
    const router = renderApp('/o/acme');
    await waitFor(() => expect(router.state.location.pathname).toBe('/signin'));
    expect(router.state.location.search).toBe('');
  });

  it('sends a signed-in user from sign in to ?next', async () => {
    session.start(sessionBody());
    const router = renderApp('/signin?next=%2Fo%2Facme%2Fmembers', [viewerMock([acme])]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/o/acme/members'));
  });

  it('ignores a ?next that leaves the site', async () => {
    session.start(sessionBody());
    const router = renderApp('/signin?next=%2F%2Fevil.test', [viewerMock([])]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
  });
});

describe('landing', () => {
  beforeEach(() => session.start(sessionBody()));

  it('opens onboarding when the user has no organization', async () => {
    const router = renderApp('/', [viewerMock([])]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome, Ada Lovelace');
  });

  it('opens the last organization used in this browser', async () => {
    localStorage.setItem('tl-last-org', 'globex');
    const router = renderApp('/', [viewerMock([acme, globex])]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/o/globex'));
  });

  it('opens the first organization when the last one is gone', async () => {
    localStorage.setItem('tl-last-org', 'left-this-one');
    const router = renderApp('/', [viewerMock([acme, globex])]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/o/acme'));
  });
});

describe('organization routes', () => {
  beforeEach(() => session.start(sessionBody()));

  it('shows the organization and remembers it', async () => {
    renderApp('/o/globex', [viewerMock([acme, globex])]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Globex' })).toBeInTheDocument();
    expect(localStorage.getItem('tl-last-org')).toBe('globex');
  });

  it('treats an organization the user is not in as not found', async () => {
    renderApp('/o/initech', [viewerMock([acme])]);
    expect(await screen.findByText('Organization not found')).toBeInTheDocument();
    expect(localStorage.getItem('tl-last-org')).toBeNull();
  });

  it('shows a retry when the viewer query fails', async () => {
    renderApp('/o/acme', [{ ...viewerMock([]), result: undefined, error: new Error('down') }]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows a 404 page for an unknown address', async () => {
    renderApp('/nowhere', [viewerMock([acme])]);
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});
