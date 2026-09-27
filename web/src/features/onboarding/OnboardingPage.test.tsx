import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CancelJoinRequestDocument,
  CreateOrganizationDocument,
  RequestToJoinOrganizationDocument,
  ViewerJoinRequestsDocument,
} from '../../generated/graphql';
import { org, pendingMock, projectsMock, sessionBody, user, viewerMock } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { browserTimezone } from './timezones';
import { resetSessionForTests, session } from '../auth/session';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
const request = (id: string, slug: string, name: string, status: Status) => ({
  __typename: 'ViewerJoinRequest' as const,
  id,
  status,
  createdAt: '2026-09-20T10:00:00.000Z',
  decidedAt: null,
  organization: { __typename: 'OrganizationSummary' as const, id: `org-${slug}`, slug, name },
});

function requestsMock(
  requests: ReturnType<typeof request>[],
  memberships: ReturnType<typeof org>[] = [],
) {
  return {
    request: { query: ViewerJoinRequestsDocument },
    result: {
      data: {
        viewer: { __typename: 'Viewer' as const, id: user.id, memberships, joinRequests: requests },
      },
    },
  };
}

beforeEach(() => {
  resetSessionForTests();
  localStorage.clear();
  session.start(sessionBody());
});

describe('create an organization', () => {
  it('suggests a slug from the name until the slug is edited', async () => {
    renderApp('/onboarding', [viewerMock([]), requestsMock([])]);
    const u = userEvent.setup();
    const name = await screen.findByLabelText('Organization name');
    const slug = screen.getByLabelText('Slug');

    await u.type(name, 'Big Co');
    expect(slug).toHaveValue('big-co');

    await u.clear(slug);
    await u.type(slug, 'bigco');
    await u.type(name, ' Holdings');
    expect(slug).toHaveValue('bigco');
  });

  it('creates it in the browser timezone and opens its dashboard', async () => {
    // Arrange
    const zone = browserTimezone();
    const router = renderApp('/onboarding', [
      viewerMock([]),
      requestsMock([]),
      {
        request: {
          query: CreateOrganizationDocument,
          variables: { input: { name: 'Initech', slug: 'initec', timezone: zone } },
        },
        result: {
          data: {
            createOrganization: {
              __typename: 'OrganizationSummary',
              id: 'org-initec',
              slug: 'initec',
              name: 'Initech',
            },
          },
        },
      },
      viewerMock([org('initec', 'Initech', 'OWNER')]),
      pendingMock('org-initec', []),
      projectsMock('org-initec', []),
    ]);
    const u = userEvent.setup();
    expect(await screen.findByRole('combobox', { name: 'Timezone' })).toHaveValue(
      zone.replaceAll('_', ' '),
    );

    // Act
    await u.type(screen.getByLabelText('Organization name'), 'Initech');
    await u.click(screen.getByRole('button', { name: 'Create organization' }));

    // Assert
    await waitFor(() => expect(router.state.location.pathname).toBe('/o/initec'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Initech' })).toBeInTheDocument();
  });

  it('shows ORG_SLUG_TAKEN on the slug field', async () => {
    const zone = browserTimezone();
    renderApp('/onboarding', [
      viewerMock([]),
      requestsMock([]),
      {
        request: {
          query: CreateOrganizationDocument,
          variables: { input: { name: 'Acme', slug: 'acme', timezone: zone } },
        },
        result: { errors: [{ message: 'x', extensions: { code: 'ORG_SLUG_TAKEN' } }] },
      },
    ]);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Organization name'), 'Acme');
    await u.click(screen.getByRole('button', { name: 'Create organization' }));
    expect(await screen.findByText('This slug is taken. Try another.')).toBeInTheDocument();
  });

  it('rejects reserved and malformed slugs before sending', async () => {
    renderApp('/onboarding', [viewerMock([]), requestsMock([])]);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Organization name'), 'Whatever');
    const slug = screen.getByLabelText('Slug');
    await u.clear(slug);
    await u.type(slug, 'admin');
    await u.click(screen.getByRole('button', { name: 'Create organization' }));
    expect(await screen.findByText(/some words are reserved/)).toBeInTheDocument();
  });
});

describe('join an organization', () => {
  it('sends a request and lists it as pending', async () => {
    renderApp('/onboarding', [
      viewerMock([]),
      requestsMock([]),
      {
        request: { query: RequestToJoinOrganizationDocument, variables: { slug: 'globex' } },
        result: {
          data: { requestToJoinOrganization: request('jr1', 'globex', 'Globex', 'PENDING') },
        },
      },
      requestsMock([request('jr1', 'globex', 'Globex', 'PENDING')]),
    ]);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Organization slug'), 'Globex');
    await u.click(screen.getByRole('button', { name: 'Request to join' }));

    expect(await screen.findByText(/Request sent to Globex/)).toBeInTheDocument();
    const section = await screen.findByRole('region', { name: 'Your requests' });
    expect(within(section).getByText('Pending')).toBeInTheDocument();
  });

  it.each([
    ['NOT_FOUND', 'No organization has this slug'],
    ['ALREADY_MEMBER', 'You are already a member of this organization'],
    ['JOIN_REQUEST_PENDING', 'You already asked to join'],
  ])('explains %s on the field', async (code, text) => {
    renderApp('/onboarding', [
      viewerMock([]),
      requestsMock([]),
      {
        request: { query: RequestToJoinOrganizationDocument, variables: { slug: 'acme' } },
        result: { errors: [{ message: 'x', extensions: { code } }] },
      },
    ]);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Organization slug'), 'acme');
    await u.click(screen.getByRole('button', { name: 'Request to join' }));
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
  });
});

describe('your requests', () => {
  it('cancels a pending request', async () => {
    renderApp('/onboarding', [
      viewerMock([]),
      requestsMock([request('jr1', 'globex', 'Globex', 'PENDING')]),
      {
        request: { query: CancelJoinRequestDocument, variables: { id: 'jr1' } },
        result: { data: { cancelJoinRequest: request('jr1', 'globex', 'Globex', 'CANCELED') } },
      },
    ]);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Cancel request' }));
    expect(await screen.findByText('Canceled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
  });

  it('opens an organization once the request is approved', async () => {
    renderApp('/onboarding', [
      viewerMock([]),
      requestsMock([request('jr1', 'globex', 'Globex', 'APPROVED')], [org('globex', 'Globex')]),
    ]);
    expect(await screen.findByRole('link', { name: 'Open' })).toHaveAttribute('href', '/o/globex');
  });
});
