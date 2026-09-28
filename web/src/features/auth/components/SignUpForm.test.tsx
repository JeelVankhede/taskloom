import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionBody, user } from '../../../test/fixtures';
import { json, renderUi } from '../../../test/render';
import { resetSessionForTests, session } from '../session';
import { SignUpForm } from './SignUpForm';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetSessionForTests();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function fill(values: { name?: string; email?: string; password?: string }) {
  const u = userEvent.setup();
  if (values.name) await u.type(screen.getByLabelText('Name'), values.name);
  if (values.email) await u.type(screen.getByLabelText('Email'), values.email);
  if (values.password) await u.type(screen.getByLabelText('Password'), values.password);
  await u.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('SignUpForm', () => {
  it('shows the contract rules for each field and sends nothing', async () => {
    // Arrange
    renderUi(<SignUpForm />);

    // Act
    await fill({ email: 'not-an-email', password: 'short' });

    // Assert
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Use 10 to 128 characters')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Use 1 to 80 characters');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a password equal to the email, as the API does', async () => {
    renderUi(<SignUpForm />);
    await fill({ name: 'Ada', email: 'ada.lovelace@x.test', password: 'Ada.Lovelace@x.test' });
    expect(await screen.findByText('Password must not be your email')).toBeInTheDocument();
  });

  it('sends a normalized email and trimmed name, then starts the session', async () => {
    // Arrange
    fetchMock.mockResolvedValue(json(201, sessionBody()));
    renderUi(<SignUpForm />);

    // Act
    await fill({ name: '  Ada Lovelace ', email: ' Ada@Example.TEST ', password: 'correct horse' });

    // Assert
    await waitFor(() => expect(session.getState()).toEqual({ status: 'signedIn', user }));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/auth/signup');
    expect(JSON.parse(String(init?.body))).toEqual({
      displayName: 'Ada Lovelace',
      email: 'ada@example.test',
      password: 'correct horse',
    });
  });

  it('shows EMAIL_TAKEN on the email field', async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      json(409, { statusCode: 409, code: 'EMAIL_TAKEN', message: 'Email already registered' }),
    );
    renderUi(<SignUpForm />);

    // Act
    await fill({ name: 'Ada', email: 'ada@example.test', password: 'correct horse' });

    // Assert
    const email = screen.getByLabelText('Email');
    await waitFor(() => expect(email).toHaveAccessibleDescription(/already exists/));
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(session.getState()).toEqual({ status: 'loading' });
  });

  it('disables the submit button while the request runs', async () => {
    // Arrange
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    renderUi(<SignUpForm />);

    // Act
    await fill({ name: 'Ada', email: 'ada@example.test', password: 'correct horse' });

    // Assert
    expect(screen.getByRole('button', { name: /Create account/ })).toBeDisabled();
    resolve(json(201, sessionBody()));
    await waitFor(() => expect(session.getState().status).toBe('signedIn'));
  });
});
