import { test, expect } from '@playwright/test';
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