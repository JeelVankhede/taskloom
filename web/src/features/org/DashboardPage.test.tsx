import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { CreateProjectDocument } from '../../generated/graphql';
import { resetSessionForTests, session } from '../auth/session';
import { org, project, projectsMock, sessionBody, viewerMock } from '../../test/fixtures';
import { renderApp } from '../../test/render';

const eng = project('ENG', 'Engineering', 'Product engineering.');
const web = project('WEB', 'Website');

beforeEach(() => {
  resetSessionForTests();
  localStorage.clear();
  session.start(sessionBody());
});

describe('DashboardPage', () => {
  it('lists the projects, each linking to its board', async () => {
    renderApp('/o/acme', [viewerMock([org('acme', 'Acme')]), projectsMock('org-acme', [eng])]);
    const card = await screen.findByRole('link', { name: /Engineering/ });
    expect(card).toHaveAttribute('href', '/o/acme/p/ENG');
    expect(within(card).getByText('Product engineering.')).toBeInTheDocument();
  });

  it('offers New project to members, and hides it from contributors', async () => {
    renderApp('/o/acme', [
      viewerMock([org('acme', 'Acme', 'CONTRIBUTOR')]),
      projectsMock('org-acme', []),
    ]);
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByText(/An owner, admin, or member can create/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
  });

  it('never shows one organization’s projects under another', async () => {
    // Arrange: Acme loads first; Globex's projects arrive late.
    const router = renderApp('/o/acme', [
      viewerMock([org('acme', 'Acme'), org('globex', 'Globex')]),
      projectsMock('org-acme', [eng]),
      projectsMock('org-globex', [web], 300),
    ]);
    await screen.findByText('ENG');

    // Act
    await router.navigate('/o/globex');

    // Assert: while Globex loads, nothing of Acme's is on screen.
    expect(await screen.findByRole('heading', { level: 1, name: 'Globex' })).toBeInTheDocument();
    expect(screen.queryByText('ENG')).not.toBeInTheDocument();
    expect(await screen.findByText('WEB')).toBeInTheDocument();
    expect(screen.queryByText('ENG')).not.toBeInTheDocument();
  });
});

describe('CreateProjectDialog', () => {
  const open = async () => {
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'New project' }));
    return u;
  };

  it('creates a project with an upper-cased key and shows it', async () => {
    // Arrange
    renderApp('/o/acme', [
      viewerMock([org('acme', 'Acme')]),
      projectsMock('org-acme', []),
      {
        request: {
          query: CreateProjectDocument,
          variables: { input: { name: 'Website', key: 'WEB', description: null } },
        },
        result: { data: { createProject: web } },
      },
      projectsMock('org-acme', [web]),
    ]);
    const u = await open();

    // Act
    await u.type(screen.getByLabelText('Name'), 'Website');
    await u.type(screen.getByLabelText('Key'), 'web');
    await u.click(screen.getByRole('button', { name: 'Create project' }));

    // Assert
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('link', { name: /Website/ })).toHaveAttribute(
      'href',
      '/o/acme/p/WEB',
    );
  });

  it('shows the key rule, and PROJECT_KEY_TAKEN on the key field', async () => {
    renderApp('/o/acme', [
      viewerMock([org('acme', 'Acme')]),
      projectsMock('org-acme', []),
      {
        request: {
          query: CreateProjectDocument,
          variables: { input: { name: 'Eng two', key: 'ENG', description: null } },
        },
        result: { errors: [{ message: 'taken', extensions: { code: 'PROJECT_KEY_TAKEN' } }] },
      },
    ]);
    const u = await open();

    await u.type(screen.getByLabelText('Name'), 'Eng two');
    await u.type(screen.getByLabelText('Key'), 'e1');
    await u.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText(/Three characters/)).toBeInTheDocument();

    await u.clear(screen.getByLabelText('Key'));
    await u.type(screen.getByLabelText('Key'), 'eng');
    await u.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Another project already uses this key')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
