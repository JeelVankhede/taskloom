import { ApolloProvider } from '@apollo/client/react';
import { useState } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createApolloClient } from './apollo';
import { routes } from './routes';
import { SessionGate } from './SessionGate';

export function App() {
  const [client] = useState(createApolloClient);
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <ApolloProvider client={client}>
      <SessionGate>
        <RouterProvider router={router} />
      </SessionGate>
    </ApolloProvider>
  );
}
