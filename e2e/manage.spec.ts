import { test, expect } from '@playwright/test';

test('manage view: add, rename, and delete a category', async ({ page }) => {
  await page.goto('/#/manage');

  const section = page.getByTestId('lookup-section-categories');
  const categories = page.getByTestId('lookup-categories');

  // add
  await section.getByPlaceholder('Add categories').fill('Electronics');
  await section.getByRole('button', { name: 'Add' }).click();
  await expect(categories).toContainText('Electronics');

  // rename
  await categories.getByRole('button', { name: 'Rename' }).click();
  await categories.locator('li input').fill('Tech');
  await categories.getByRole('button', { name: 'Save' }).click();
  await expect(categories).toContainText('Tech');
  await expect(categories).not.toContainText('Electronics');

  // delete
  await categories.getByRole('button', { name: 'Delete' }).click();
  await expect(categories).not.toContainText('Tech');
});

test('categories persist across reload and appear in item autocomplete', async ({ page }) => {
  await page.goto('/#/manage');

  const section = page.getByTestId('lookup-section-categories');
  await section.getByPlaceholder('Add categories').fill('Electronics');
  await section.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('lookup-categories')).toContainText('Electronics');

  await page.reload();
  await expect(page.getByTestId('lookup-categories')).toContainText('Electronics');

  // category shows up in the item form's datalist
  await page.goto('/#/');
  await expect(
    page.locator('#item-category-options option[value="Electronics"]'),
  ).toHaveCount(1);
});

test('deleting a category unlinks items instead of deleting them', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    window.__db.insertItem({ name: 'TV', category: 'Electronics' }),
  );
  await page.reload();
  await expect(page.getByTestId('item-list')).toContainText('TV');

  await page.goto('/#/manage');
  await expect(page.getByTestId('lookup-categories')).toContainText('Electronics');
  await page.getByTestId('lookup-categories').getByRole('button', { name: 'Delete' }).click();

  // item survives, category gone
  await page.goto('/#/');
  await expect(page.getByTestId('item-list')).toContainText('TV');
  await page.goto('/#/manage');
  await expect(page.getByTestId('lookup-categories')).not.toContainText('Electronics');
});