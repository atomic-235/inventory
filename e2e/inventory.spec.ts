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

  await page.getByRole('button', { name: 'Save' }).click();

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