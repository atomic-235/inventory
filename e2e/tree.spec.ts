import { test, expect } from '@playwright/test';
import type { Item } from '../src/domain/item';

async function seed(page: import('@playwright/test').Page, item: Partial<Item>): Promise<Item> {
  return page.evaluate(
    (it) => window.__db.insertItem({ name: 'x', quantity: 1, ...it } as never),
    item,
  );
}

test('tree view shows hierarchy with expand/collapse', async ({ page }) => {
  await page.goto('/');
  const box = await seed(page, { name: 'Box', category: 'Storage' });
  const cable = await seed(page, { name: 'Cable', parent_id: box.id });
  await page.reload();

  await page.getByRole('button', { name: 'Tree' }).click();
  await expect(page.getByTestId('item-tree')).toBeVisible();
  await expect(page.getByTestId('item-list')).toHaveCount(0);

  // Cable is nested under Box (not a root row)
  const rows = page.locator('[data-item-id]');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveText(/Box/);
  await expect(rows.nth(1)).toHaveText(/Cable/);

  // collapse Box hides Cable's row
  await page.locator(`[data-item-id="${box.id}"] .twisty`).click();
  await expect(page.locator(`[data-item-id="${cable.id}"]`)).toHaveCount(0);

  // expand again reveals it
  await page.locator(`[data-item-id="${box.id}"] .twisty`).click();
  await expect(page.locator(`[data-item-id="${cable.id}"]`)).toHaveCount(1);
});

test('add child prefills container and nests the new item', async ({ page }) => {
  await page.goto('/');
  const box = await seed(page, { name: 'Box' });
  await page.reload();

  await page.getByRole('button', { name: 'Tree' }).click();
  await page.locator(`[data-item-id="${box.id}"]`).getByRole('button', { name: '+ Child' }).click();

  await expect(page.getByLabel('Container')).toHaveValue(box.id);
  await page.getByLabel('Name').fill('Battery');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  const items = await page.evaluate(() => window.__db.listItems());
  const child = items.find((i: Item) => i.name === 'Battery');
  expect(child?.parent_id).toBe(box.id);
});

test('drag onto another item reparents it, respecting cycle protection', async ({ page }) => {
  await page.goto('/');
  const box = await seed(page, { name: 'Box' });
  const cable = await seed(page, { name: 'Cable', parent_id: box.id });
  const loose = await seed(page, { name: 'Loose' });
  await page.reload();

  await page.getByRole('button', { name: 'Tree' }).click();

  // drag "Loose" onto "Cable" -> Loose becomes Cable's child
  await page.locator(`[data-item-id="${loose.id}"]`).dragTo(
    page.locator(`[data-item-id="${cable.id}"]`),
  );
  let items = await page.evaluate(() => window.__db.listItems());
  expect(items.find((i: Item) => i.name === 'Loose')?.parent_id).toBe(cable.id);

  // dragging "Cable" onto its descendant "Loose" would create a cycle -> rejected
  await page.locator(`[data-item-id="${cable.id}"]`).dragTo(
    page.locator(`[data-item-id="${loose.id}"]`),
  );
  await expect(page.getByRole('alert')).toBeVisible();
  items = await page.evaluate(() => window.__db.listItems());
  expect(items.find((i: Item) => i.name === 'Cable')?.parent_id).toBe(box.id);
});