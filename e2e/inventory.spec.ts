import { test, expect } from '@playwright/test';
import type { ItemFieldsInput } from '../src/domain/item';

const CONFIG = { baseUrl: 'https://api.example.com/v1', apiKey: 'k', model: 'm' };
const CANNED = {
  name: 'Camera',
  category: 'Electronics',
  quantity: 1,
  unit: 'pc',
  location: 'Office',
  purchase_date: '',
  purchase_price: null,
  condition: 'good',
  notes: '',
};

test.use({ permissions: ['camera'] });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((cfg) => {
    localStorage.setItem('inventory.provider', JSON.stringify(cfg));
  }, CONFIG);

  await page.route('**/chat/completions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { role: 'assistant', content: JSON.stringify(CANNED) } }],
      }),
    }),
  );
});

async function seed(page: import('@playwright/test').Page, item: ItemFieldsInput): Promise<void> {
  await page.evaluate((it) => window.__db.insertItem(it), item);
}

test('add item by photo: capture -> extract -> prefill -> save -> listed', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Add by photo' }).click();

  const name = page.getByLabel('Name');
  await expect(name).toHaveValue('Camera');
  await expect(page.getByLabel('Category')).toHaveValue('Electronics');

  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByTestId('item-list')).toContainText('Camera');
  await expect(page.getByTestId('item-list')).toContainText('Electronics');
});

test('edit item updates the list', async ({ page }) => {
  await page.goto('/');
  await seed(page, {
    name: 'Lamp',
    category: 'Furniture',
    quantity: 1,
    unit: '',
    location: '',
    purchase_date: '',
    purchase_price: null,
    condition: '',
    notes: '',
  });
  await page.reload();

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Name').fill('Floor Lamp');
  await page.getByRole('button', { name: 'Update' }).click();

  await expect(page.getByTestId('item-list')).toContainText('Floor Lamp');
});

test('delete item removes it', async ({ page }) => {
  await page.goto('/');
  await seed(page, { name: 'Lamp' });
  await page.reload();

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('item-list')).not.toContainText('Lamp');
});

test('search filters items', async ({ page }) => {
  await page.goto('/');
  await seed(page, { name: 'Lamp', category: 'Furniture' });
  await seed(page, { name: 'Camera', category: 'Electronics' });
  await page.reload();

  await page.getByLabel('Search').fill('camera');
  await expect(page.getByTestId('item-list')).toContainText('Camera');
  await expect(page.getByTestId('item-list')).not.toContainText('Lamp');
});

test('export csv downloads inventory.csv', async ({ page }) => {
  await page.goto('/');
  await seed(page, { name: 'Lamp', category: 'Furniture' });
  await page.reload();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('inventory.csv');
});

test('typing a known name autofills related fields', async ({ page }) => {
  await page.goto('/');
  await seed(page, { name: 'Sony TV', category: 'Electronics', unit: 'pc', location: 'Office', condition: 'good', purchase_price: 999.99, quantity: 2 });
  await page.reload();
  await expect(page.getByTestId('item-list')).toContainText('Sony TV');

  await page.getByLabel('Name').fill('Sony TV');

  await expect(page.getByLabel('Category')).toHaveValue('Electronics');
  await expect(page.getByLabel('Unit')).toHaveValue('pc');
  await expect(page.getByLabel('Location')).toHaveValue('Office');
  await expect(page.getByLabel('Condition')).toHaveValue('good');
  await expect(page.getByLabel('Purchase price')).toHaveValue('999.99');
  await expect(page.getByLabel('Quantity')).toHaveValue('2');
});

test('add manually with cross-dependent autocomplete', async ({ page }) => {
  await page.goto('/');
  await seed(page, { name: 'TV', category: 'Electronics', location: 'Office', unit: 'pc' });
  await seed(page, { name: 'Drill', category: 'Electronics', location: 'Garage', unit: 'pc' });
  await seed(page, { name: 'Sofa', category: 'Furniture', location: 'Living Room', unit: 'set' });
  await page.reload();

  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByTestId('item-list')).toContainText('TV');

  await page.getByLabel('Category').fill('Electronics');

  const locations = await page.$$eval('#item-location-options option', (els) =>
    els.map((e) => e.getAttribute('value')),
  );
  expect(locations).toEqual(['Garage', 'Office']);

  await page.getByLabel('Name').fill('Monitor');
  await page.getByLabel('Location').fill('Garage');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByTestId('item-list')).toContainText('Monitor');
});