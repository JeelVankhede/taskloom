import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // The browser talks only to this origin; /auth and /graphql are proxied to the API. Same origin
  // means the refresh cookie (SameSite=Strict, Path=/auth) works and no CORS is involved.
  // Origin is forwarded unchanged: the API's /auth routes check it against WEB_ORIGIN.
  const env = loadEnv(mode, '..', '');
  const target = `http://localhost:${env.API_PORT || '4000'}`;
  const proxy = { '/auth': { target }, '/graphql': { target } };

  return {
    plugins: [react()],
    envDir: '..',
    server: { port: 5173, strictPort: true, proxy },
    preview: { proxy },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
