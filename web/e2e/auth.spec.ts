import { expect, type Page, test } from '@playwright/test';
import { FakeApi } from './support/fake-api';

const PASSWORD = 'correct horse battery';
let api: FakeApi;

/** The built app ships a Content-Security-Policy; nothing it loads may be refused by it. */
let cspViolations: string[] = [];

test.beforeEach(async ({ context }) => {
  cspViolations = [];
  context.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
      cspViolations.push(message.text());
    }
  });
  api = new FakeApi();
  api.addAccount({
    email: 'member@example.test',
    password: PASSWORD,
    displayName: 'Mia Member',
    orgs: [
      { slug: 'acme', name: 'Acme' },
      { slug: 'globex', name: 'Globex' },
    ],
  });
  await api.install(context);
});

/**
 * Navigations render in a transition: the URL changes before the new page is on screen. Wait for
 * the sign-in page itself, or typing could land in the page being replaced.
 */
test.afterEach(() => {
  expect(cspViolations).toEqual([]);
});

async function signIn(page: Page, email: string, password = PASSWORD) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}

test('sign up, sign out, sign in', async ({ page }) => {
  // Sign up: a new account has no organization, so it lands on onboarding.
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Nia New');
  await page.getByLabel('Email').fill('Nia@Example.test');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/onboarding');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome, Nia New');

  // The session survives a reload (restored from the HttpOnly cookie).
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome, Nia New');

  // Sign out: back to sign in, and signed-in pages are closed.
  await signOut(page);
  await expect(page).toHaveURL('/signin');
  await page.goto('/onboarding');
  await expect(page).toHaveURL('/signin?next=%2Fonboarding');

  // Sign in (the email was stored normalized) and return to the page asked for.
  await signIn(page, 'nia@example.test');
  await expect(page).toHaveURL('/onboarding');
  expect(api.reuse).toEqual([]);
});

test('shows server errors next to the form', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Mia Again');
  await page.getByLabel('Email').fill('member@example.test');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('An account with this email already exists')).toBeVisible();

  await page.getByRole('link', { name: 'Sign in' }).click();
  await signIn(page, 'member@example.test', 'wrong password!');
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
});

test('a deep link survives sign in, and the switcher changes organization', async ({ page }) => {
  await page.goto('/o/globex/members');
  await expect(page).toHaveURL('/signin?next=%2Fo%2Fglobex%2Fmembers');
  await signIn(page, 'member@example.test');
  await expect(page).toHaveURL('/o/globex/members');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Members');

  await page.getByRole('button', { name: 'Globex' }).click();
  await page.getByRole('menuitem', { name: /Acme/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Acme');

  // "/" returns to the organization used last.
  await page.goto('/');
  await expect(page).toHaveURL('/o/acme');
});

test('tabs refresh one at a time, so strict rotation never signs the user out', async ({
  context,
  page,
}) => {
  await page.goto('/signin');
  await signIn(page, 'member@example.test');
  await expect(page).toHaveURL('/o/acme');
  const tabs = [page, await context.newPage(), await context.newPage()];
  api.refreshCalls = 0;

  // Every tab loads at the same moment, and each refreshes on load.
  await Promise.all(tabs.map((tab) => tab.goto('/o/acme')));

  for (const tab of tabs) {
    await expect(tab.getByRole('heading', { level: 1 })).toHaveText('Acme');
  }
  expect(api.refreshCalls).toBe(3);
  expect(api.reuse).toEqual([]);
});

test('signing out in one tab signs out the others', async ({ context, page }) => {
  await page.goto('/signin');
  await signIn(page, 'member@example.test');
  const other = await context.newPage();
  await other.goto('/o/globex');
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Globex');

  await signOut(page);

  await expect(other).toHaveURL('/signin');
});
