import type { RouteObject } from 'react-router';
import { OnboardingPage } from '../features/onboarding/OnboardingPage';
import { SignInPage } from '../features/auth/pages/SignInPage';
import { SignUpPage } from '../features/auth/pages/SignUpPage';
import { DashboardPage } from '../features/org/DashboardPage';
import { MembersPage } from '../features/members/MembersPage';
import { OrgLayout } from '../features/org/OrgLayout';
import { PublicOnly, RequireAuth } from './guards';
import { NotFound } from './NotFound';
import { RouteError } from './RouteError';
import { AppShell } from './shell/AppShell';
import { HomeRedirect } from './shell/HomeRedirect';

/**
 * Every route (implementation plan section 3.6). Each screen has its own error boundary, so a
 * crash replaces only that screen.
 */
export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: 'signin', element: <SignInPage />, errorElement: <RouteError /> },
          { path: 'signup', element: <SignUpPage />, errorElement: <RouteError /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <HomeRedirect />, errorElement: <RouteError /> },
              { path: 'onboarding', element: <OnboardingPage />, errorElement: <RouteError /> },
              {
                path: 'o/:orgSlug',
                element: <OrgLayout />,
                errorElement: <RouteError />,
                children: [
                  { index: true, element: <DashboardPage />, errorElement: <RouteError /> },
                  { path: 'members', element: <MembersPage />, errorElement: <RouteError /> },
                  {
                    // Loaded on demand: the board, its charts, and date pickers stay out of the
                    // main bundle.
                    path: 'p/:projectKey',
                    lazy: async () => ({
                      Component: (await import('../features/task-board/TaskBoardPage'))
                        .TaskBoardPage,
                    }),
                    errorElement: <RouteError />,
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
