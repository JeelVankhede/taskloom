import { expect, test } from '@playwright/test';

test('sign up, sign out, and sign in against the real API', async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const password = 'e2e-stack-password';
  const heading = page.getByRole('heading', { level: 1 });

  // Sign up. A new account has no organization: onboarding.
  await page.goto('/signup');
  await expect(heading).toHaveText('Create your account');
  await page.getByLabel('Name').fill('Stack Smoke');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(heading).toHaveText('Welcome, Stack Smoke');
  await expect(page).toHaveURL('/onboarding');

  // A reload restores the session: the HttpOnly cookie reaches /auth/refresh through the proxy,
  // passes the Origin check, rotates, and the new access token authorizes the viewer query.
  await page.reload();
  await expect(heading).toHaveText('Welcome, Stack Smoke');

  // Sign out revokes the session; a reload does not bring it back.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(heading).toHaveText('Sign in');
  await page.reload();
  await expect(heading).toHaveText('Sign in');

  // Sign in again.
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(heading).toHaveText('Welcome, Stack Smoke');
});
