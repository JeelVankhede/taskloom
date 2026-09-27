import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AddMemberDocument,
  ApproveJoinRequestDocument,
  RejectJoinRequestDocument,
} from '../../generated/graphql';
import {
  joinRequest,
  member,
  membersMock,
  org,
  pendingMock,
  person,
  sessionBody,
  viewerMock,
} from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { resetSessionForTests, session } from '../auth/session';

const owner = person('u1', 'Ada Lovelace', 'ada@example.test');
const reza = person('u2', 'Reza Requester', 'reza@example.test');
const bo = person('u3', 'Bo Both', null);

beforeEach(() => {
  resetSessionForTests();
  localStorage.clear();
  session.start(sessionBody());
});

describe('MembersPage for a member', () => {
  it('lists members without managing access', async () => {
    renderApp('/o/acme/members', [
      viewerMock([org('acme', 'Acme', 'MEMBER')]),
      membersMock('org-acme', [member(owner, 'OWNER'), member(bo, 'MEMBER', 'DEACTIVATED')]),
    ]);
    const list = await screen.findByRole('list', { name: 'Members' });
    expect(within(list).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(list).getByText('Bo Both (deactivated)')).toBeInTheDocument();
    expect(within(list).getByText('Owner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument();
    expect(screen.queryByText('Join requests')).not.toBeInTheDocument();
  });
});

describe('MembersPage for an owner', () => {
  const base = [
    viewerMock([org('acme', 'Acme', 'OWNER')]),
    // The tab badge and the page read the same pending page.
    pendingMock('org-acme', [joinRequest('jr1', reza)]),
    membersMock('org-acme', [member(owner, 'OWNER')]),
  ];

  it('shows the pending count on the Members tab', async () => {
    renderApp('/o/acme/members', base);
    expect(
      await screen.findByRole('tab', { name: 'Members, 1 pending join requests' }),
    ).toBeInTheDocument();
  });

  it('approves a request with the chosen role, and the person joins the list', async () => {
    // Arrange
    renderApp('/o/acme/members', [
      ...base,
      {
        request: { query: ApproveJoinRequestDocument, variables: { id: 'jr1', role: 'ADMIN' } },
        result: { data: { approveJoinRequest: member(reza, 'ADMIN') } },
      },
      pendingMock('org-acme', []),
      membersMock('org-acme', [member(owner, 'OWNER'), member(reza, 'ADMIN')]),
    ]);
    const u = userEvent.setup();
    const row = await screen.findByRole('group', { name: 'Join request from Reza Requester' });

    // Act
    await u.click(within(row).getByRole('combobox', { name: 'Role' }));
    await u.click(screen.getByRole('option', { name: 'Admin' }));
    await u.click(within(row).getByRole('button', { name: 'Approve Reza Requester' }));

    // Assert: both lists refetch; each lands on its own.
    await waitFor(() => expect(screen.queryByText('Join requests')).not.toBeInTheDocument());
    const list = screen.getByRole('list', { name: 'Members' });
    expect(await within(list).findByText('Reza Requester')).toBeInTheDocument();
    expect(within(list).getByText('Admin')).toBeInTheDocument();
  });

  it('never offers Owner as a role', async () => {
    renderApp('/o/acme/members', base);
    const u = userEvent.setup();
    const row = await screen.findByRole('group', { name: 'Join request from Reza Requester' });
    await u.click(within(row).getByRole('combobox', { name: 'Role' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Admin',
      'Member',
      'Contributor',
    ]);
  });

  it('explains when someone else already decided', async () => {
    renderApp('/o/acme/members', [
      ...base,
      {
        request: { query: RejectJoinRequestDocument, variables: { id: 'jr1' } },
        result: { errors: [{ message: 'x', extensions: { code: 'JOIN_REQUEST_NOT_PENDING' } }] },
      },
    ]);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Reject Reza Requester' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else already decided');
  });

  it('adds a member by email, and explains an unknown email', async () => {
    renderApp('/o/acme/members', [
      ...base,
      {
        request: {
          query: AddMemberDocument,
          variables: { email: 'nobody@example.test', role: 'MEMBER' },
        },
        result: { errors: [{ message: 'x', extensions: { code: 'NOT_FOUND' } }] },
      },
    ]);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Add member' }));
    await u.type(screen.getByLabelText('Email'), ' Nobody@Example.test ');
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add member' }));
    expect(await screen.findByText(/No account uses this email/)).toBeInTheDocument();
  });
});
