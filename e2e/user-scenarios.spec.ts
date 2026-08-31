import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { ItemFieldsInput } from '../src/domain/item';

const CONFIG = { baseUrl: 'https://api.example.com/v1', apiKey: 'k', model: 'm' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((cfg) => {
    localStorage.setItem('inventory.provider', JSON.stringify(cfg));
  }, CONFIG);
});

async function seed(page: import('@playwright/test').Page, item: ItemFieldsInput): Promise<void> {
  await page.evaluate((it) => window.__db.insertItem(it), item);
}

// S1 — first-run onboarding: brand-new values entered inline via the "+" buttons.
test('first item: create category/unit/location inline, then it lands in Manage', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Name').fill('Espresso machine');
  await page.getByRole('button', { name: 'Add Category' }).click();
  await page.getByLabel('Category', { exact: true }).fill('Kitchen');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Add Unit' }).click();
  await page.getByLabel('Unit', { exact: true }).fill('pc');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Add Location' }).click();
  await page.getByLabel('Location', { exact: true }).fill('Counter');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByTestId('item-list')).toContainText('Espresso machine');
  await expect(page.getByRole('status')).toContainText('Saved');

  await page.goto('/#/manage');
  await expect(page.getByTestId('lookup-categories')).toContainText('Kitchen');
  await expect(page.getByTestId('lookup-units')).toContainText('pc');
  await expect(page.getByTestId('lookup-locations')).toContainText('Counter');
});

// S2 — autofill must not clobber a value the user already picked by hand.
test('autofill fills only empty fields, leaving manual choices intact', async ({ page }) => {
  await page.goto('/');
  await seed(page, {
    name: 'Sony TV',
    category: 'Electronics',
    quantity: 2,
    unit: 'pc',
    location: 'Office',
    condition: 'good',
    purchase_price: 999.99,
  });
  await page.reload();

  await page.getByLabel('Category', { exact: true }).selectOption('Electronics');
  await page.getByLabel('Name').fill('Sony TV');
  await page.getByLabel('Name').press('Tab');

  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('Electronics');
  await expect(page.getByLabel('Unit', { exact: true })).toHaveValue('pc');
  await expect(page.getByLabel('Quantity')).toHaveValue('2');
});

// S3 — submitting with no name must not silently fail: show feedback, add nothing.
test('empty name is rejected with visible feedback', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('item-list').locator('li')).toHaveCount(0);
});

// S4 — zero/negative quantity must be rejected with visible feedback.
test('zero quantity is rejected with visible feedback', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Name').fill('Lamp');
  await page.getByLabel('Quantity').fill('0');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('item-list').locator('li')).toHaveCount(0);
});

// S5 — canceling an edit returns to a clean "add" form and leaves the item unchanged.
test('cancel edit restores add mode without modifying the item', async ({ page }) => {
  await page.goto('/');
  await seed(page, { name: 'Lamp', category: 'Furniture' });
  await page.reload();

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Name').fill('Floor Lamp');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByLabel('Name')).toHaveValue('');
  await expect(page.getByTestId('item-list')).toContainText('Lamp');
  await expect(page.getByTestId('item-list')).not.toContainText('Floor Lamp');
});

// S6 — exporting the raw SQLite database produces a valid file a desktop tool can open.
test('exports a valid SQLite database file', async ({ page }) => {
  await page.goto('/');
  await seed(page, { name: 'Lamp', category: 'Furniture', quantity: 1 });
  await page.reload();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SQLite' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('inventory.sqlite');

  const buf = readFileSync((await download.path()) as string);
  expect(buf.subarray(0, 16).toString('ascii')).toBe('SQLite format 3\u0000');
  expect(buf.toString('utf8')).toContain('Lamp');
});

// S7 — round-trip: export a snapshot, drift the DB, then import the snapshot to restore it.
test('imports a SQLite file, replacing current data', async ({ page }) => {
  await page.goto('/');
  await seed(page, { name: 'Alpha', category: 'Furniture' });
  await seed(page, { name: 'Beta', category: 'Furniture' });
  await page.reload();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SQLite' }).click();
  const snapshot = readFileSync((await (await downloadPromise).path()) as string);

  await seed(page, { name: 'Gamma', category: 'Furniture' });
  await page.reload();
  await expect(page.getByTestId('item-list')).toContainText('Gamma');

  await page.setInputFiles('input[type="file"]', {
    name: 'backup.sqlite',
    mimeType: 'application/x-sqlite3',
    buffer: snapshot,
  });

  await expect(page.getByRole('status')).toContainText('Imported');
  await expect(page.getByTestId('item-list')).toContainText('Alpha');
  await expect(page.getByTestId('item-list')).toContainText('Beta');
  await expect(page.getByTestId('item-list')).not.toContainText('Gamma');
});

// S8 — importing a non-SQLite file is rejected with feedback and leaves data intact.
test('importing a corrupt file is rejected without destroying data', async ({ page }) => {
  await page.goto('/');
  await seed(page, { name: 'Keep' });
  await page.reload();

  await page.setInputFiles('input[type="file"]', {
    name: 'junk.sqlite',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('this is not a sqlite database'),
  });

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('item-list')).toContainText('Keep');
});