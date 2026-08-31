import { test, expect } from '@playwright/test';

test('db worker initializes and persists items across reload', async ({ page }) => {
  await page.goto('/');

  const initial = await page.evaluate(() => window.__db.listItems());
  expect(initial).toEqual([]);

  await page.evaluate(() =>
    window.__db.insertItem({
      name: 'Camera',
      category: 'Electronics',
      quantity: 1,
      unit: 'pc',
      location: 'Office',
      purchase_date: '',
      purchase_price: null,
      condition: 'good',
      notes: '',
    }),
  );

  await page.reload();

  const after = await page.evaluate(() => window.__db.listItems());
  expect(after).toHaveLength(1);
  expect(after[0].name).toBe('Camera');
});