import { expect, test } from '@playwright/test';
import { createOrganization, heading, signUp, uniqueEmail, uniqueSlug } from './support';

test('sign up, create an organization, create a project', async ({ page }) => {
  const slug = uniqueSlug();
  await signUp(page, 'Olga Owner', uniqueEmail('owner'));
  await createOrganization(page, 'Olga Industries', slug);

  // A new organization has no projects; its owner can create one.
  await expect(page.getByText('No projects yet')).toBeVisible();
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Name').fill('Website');
  await dialog.getByLabel('Key').fill('web');
  await dialog.getByLabel('Description (optional)').fill('Marketing site');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await expect(dialog).toBeHidden();
  const card = page.getByRole('link', { name: /Website/ });
  await expect(card).toHaveAttribute('href', `/o/${slug}/p/WEB`);
  await expect(card).toContainText('Marketing site');

  // The key is unique within the organization.
  await page.getByRole('button', { name: 'New project' }).click();
  await dialog.getByLabel('Name').fill('Website again');
  await dialog.getByLabel('Key').fill('WEB');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(dialog.getByText('Another project already uses this key')).toBeVisible();
});

test('a second user asks to join, the owner approves, and they see the organization', async ({
  browser,
}) => {
  const slug = uniqueSlug();
  const owner = await (await browser.newContext()).newPage();
  const joiner = await (await browser.newContext()).newPage();

  // The owner creates the organization.
  await signUp(owner, 'Olga Owner', uniqueEmail('owner'));
  await createOrganization(owner, 'Olga Industries', slug);

  // The second user asks to join by slug, and sees the request as pending.
  await signUp(joiner, 'Jo Joiner', uniqueEmail('joiner'));
  const join = joiner.getByRole('form', { name: 'Join an organization' });
  await join.getByLabel('Organization slug').fill(slug);
  await join.getByRole('button', { name: 'Request to join' }).click();
  await expect(joiner.getByText('Request sent to Olga Industries')).toBeVisible();
  const requests = joiner.getByRole('region', { name: 'Your requests' });
  await expect(requests.getByText('Pending')).toBeVisible();

  // The owner sees the request (tab badge and list) and approves it as a contributor.
  await owner.reload();
  await expect(owner.getByRole('tab', { name: 'Members, 1 pending join requests' })).toBeVisible();
  await owner.getByRole('tab', { name: /Members/ }).click();
  const row = owner.getByRole('group', { name: 'Join request from Jo Joiner' });
  await row.getByRole('combobox', { name: 'Role' }).click();
  await owner.getByRole('option', { name: 'Contributor' }).click();
  await row.getByRole('button', { name: 'Approve Jo Joiner' }).click();
  await expect(row).toBeHidden();
  const members = owner.getByRole('list', { name: 'Members' });
  await expect(members.getByText('Jo Joiner')).toBeVisible();
  await expect(members.getByText('Contributor')).toBeVisible();

  // The second user now sees the organization, as a contributor (no New project).
  await joiner.reload();
  await expect(requests.getByText('Approved')).toBeVisible();
  await requests.getByRole('link', { name: 'Open' }).click();
  await expect(heading(joiner)).toHaveText('Olga Industries');
  await expect(joiner.getByText('No projects yet')).toBeVisible();
  await expect(joiner.getByRole('button', { name: 'New project' })).toHaveCount(0);
});
