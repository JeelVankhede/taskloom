import { expect, type Page, test } from '@playwright/test';

/**
 * The Task Board on the seeded data (npm run seed: Acme's ENG project, 2,500 tasks). Read-only,
 * so it runs in any order and on any seeded database.
 */
const DEMO_PASSWORD = 'taskloom-demo-2026';

async function signIn(page: Page) {
  await page.goto('/signin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
  await page.getByLabel('Email').fill('member@acme.test');
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/o\/acme/);
}

/** The summary's Total, and the sum of the column counts: the two must always agree. */
async function counts(page: Page) {
  const summary = page.getByRole('region', { name: 'Summary' });
  const total = Number(
    (await summary.locator('dt', { hasText: 'Total' }).locator('+ dd').innerText()).replace(
      /,/g,
      '',
    ),
  );
  const labels = await page
    .locator('section[aria-label$=" task"], section[aria-label$=" tasks"]')
    .evaluateAll((sections) => sections.map((s) => s.getAttribute('aria-label') ?? ''));
  const columns = labels.reduce(
    (sum, label) => sum + Number(/, (\d+) tasks?$/.exec(label)?.[1] ?? 0),
    0,
  );
  return { total, columns };
}

test('a filter updates the board and the summary together, and the URL restores it', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/o/acme/p/ENG');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Engineering');
  await expect(
    page
      .getByRole('region', { name: /^Backlog, / })
      .getByRole('listitem')
      .first(),
  ).toBeVisible();
  const all = await counts(page);
  expect(all.total).toBeGreaterThan(2000);
  expect(all.columns).toBe(all.total);

  // Filter by priority through the UI.
  await page.getByRole('combobox', { name: 'Priority' }).click();
  await page.getByRole('option', { name: 'Urgent' }).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/[?&]priority=URGENT/);
  await expect.poll(async () => (await counts(page)).total).toBeLessThan(all.total);
  const urgent = await counts(page);
  expect(urgent.columns).toBe(urgent.total);
  await expect(
    page.getByRole('img', {
      name: /Tasks by priority: Urgent \d+, High 0, Medium 0, Low 0, No priority 0/,
    }),
  ).toBeVisible();

  // Add "overdue only": both narrow again, together.
  // The switch reflects the URL, which renders in a transition: click, then wait for the state.
  await page.getByLabel('Overdue only').click();
  await expect(page.getByLabel('Overdue only')).toBeChecked();
  await expect(page).toHaveURL(/[?&]overdue=1/);
  await expect.poll(async () => (await counts(page)).total).toBeLessThan(urgent.total);
  const overdue = await counts(page);
  expect(overdue.columns).toBe(overdue.total);

  // A reload (or a shared link) restores the same view.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
  await expect(page.getByLabel('Overdue only')).toBeChecked();
  await expect.poll(async () => (await counts(page)).total).toBe(overdue.total);

  // A card opens its details in the side pane, addressable by URL.
  const card = page
    .getByRole('region', { name: /^Todo, / })
    .getByRole('listitem')
    .first()
    .getByRole('button');
  const identifier = (await card.locator('.MuiTypography-caption').first().innerText()).trim();
  await card.click();
  await expect(page).toHaveURL(new RegExp(`[?&]task=${identifier}`));
  const pane = page.getByRole('dialog', { name: 'Task details' });
  await expect(pane.getByText(identifier)).toBeVisible();
  await expect(pane.getByText('Urgent')).toBeVisible();

  // Clearing the filters brings every task back.
  await pane.getByRole('button', { name: 'Close task details' }).click();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect.poll(async () => (await counts(page)).total).toBe(all.total);
});
