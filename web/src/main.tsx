import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ThemeProvider } from './design-system';
import { session } from './features/auth/session';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

// Restore the session from the refresh cookie once, before the first route renders.
void session.restore();

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
