import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionBody } from '../../../test/fixtures';
import { json, renderUi } from '../../../test/render';
import { resetSessionForTests, session } from '../session';
import { SignInForm } from './SignInForm';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetSessionForTests();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function submit(email: string, password: string) {
  const u = userEvent.setup();
  if (email) await u.type(screen.getByLabelText('Email'), email);
  if (password) await u.type(screen.getByLabelText('Password'), password);
  await u.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('SignInForm', () => {
  it('asks for both fields before sending anything', async () => {
    renderUi(<SignInForm />);
    await submit('', '');
    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows one message for a wrong email or password', async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      json(401, { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' }),
    );
    renderUi(<SignInForm />);

    // Act
    await submit('ada@example.test', 'wrong password');

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  });

  it('explains rate limiting', async () => {
    fetchMock.mockResolvedValue(
      json(429, { statusCode: 429, code: 'RATE_LIMITED', message: 'Too many requests' }),
    );
    renderUi(<SignInForm />);
    await submit('ada@example.test', 'whatever password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });

  it('starts the session with the normalized email', async () => {
    fetchMock.mockResolvedValue(json(200, sessionBody()));
    renderUi(<SignInForm />);
    await submit('ADA@example.test', 'correct horse');
    await waitFor(() => expect(session.getState().status).toBe('signedIn'));
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      email: 'ada@example.test',
      password: 'correct horse',
    });
  });
});
