import type { MockLink } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import type { Decorator } from '@storybook/react-vite';
import { createCache } from '../../../app/apollo';
import { OrgContext } from '../../org/org-context';

/** Stories for components that query: the app's cache, mocked responses, and an organization. */
export const withOrg =
  (mocks: MockLink.MockedResponse[] = []): Decorator =>
  (Story) => (
    <MockedProvider mocks={mocks} cache={createCache()}>
      <OrgContext.Provider value={{ id: 'org-acme', slug: 'acme', name: 'Acme', role: 'MEMBER' }}>
        <Story />
      </OrgContext.Provider>
    </MockedProvider>
  );
