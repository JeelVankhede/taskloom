import type { MockLink } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../app/routes';
import { ThemeProvider } from '../design-system';

/** Renders the real route tree at `path`, with mocked GraphQL responses. */
export function renderApp(path: string, mocks: MockLink.MockedResponse[] = []) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeProvider>
      <MockedProvider mocks={mocks}>
        <RouterProvider router={router} />
      </MockedProvider>
    </ThemeProvider>,
  );
  return router;
}

export function renderUi(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/** A JSON fetch Response. */
export const json = (status: number, body?: unknown): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
