import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'e2e-stack-password';

const random = (length: number, alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789') =>
  Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

/** Every run creates fresh accounts and organizations, so runs never collide. */
export const uniqueEmail = (who: string) => `e2e-${who}-${Date.now()}-${random(4)}@example.test`;
/** Org slugs are global and 3 to 6 characters: "e" plus 5 random. */
export const uniqueSlug = () => `e${random(5)}`;

export const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/** Signs up and waits for onboarding. */
export async function signUp(page: Page, displayName: string, email: string) {
  await page.goto('/signup');
  await expect(heading(page)).toHaveText('Create your account');
  await page.getByLabel('Name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(heading(page)).toHaveText(`Welcome, ${displayName}`);
}

/** From onboarding: creates an organization and waits for its dashboard. */
export async function createOrganization(page: Page, name: string, slug: string) {
  const form = page.getByRole('form', { name: 'Create an organization' });
  await form.getByLabel('Organization name').fill(name);
  await form.getByLabel('Slug').fill(slug);
  await form.getByRole('button', { name: 'Create organization' }).click();
  await expect(heading(page)).toHaveText(name);
  await expect(page).toHaveURL(`/o/${slug}`);
}
