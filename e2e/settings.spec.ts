import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('provider config persists across reload', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByLabel('Base URL').fill('https://api.example.com/v1');
  await page.getByLabel('API key').fill('secret');
  await page.getByLabel('Model').fill('qwen3-6-35b-a3b');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('status')).toHaveText('Saved');

  await page.reload();
  await expect(page.getByLabel('Base URL')).toHaveValue('https://api.example.com/v1');
  await expect(page.getByLabel('API key')).toHaveValue('secret');
  await expect(page.getByLabel('Model')).toHaveValue('qwen3-6-35b-a3b');
});

test('settings are carried in the SQLite backup and restored on import', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByLabel('Base URL').fill('https://api.example.com/v1');
  await page.getByLabel('API key').fill('top-secret-key');
  await page.getByLabel('Model').fill('qwen3-6-35b-a3b');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');

  // export the database (no items needed — a settings-only backup is valid)
  await page.goto('/');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SQLite' }).click();
  const buf = readFileSync((await (await downloadPromise).path()) as string);

  // settings snapshot is inside the sqlite bytes
  expect(buf.toString('utf8')).toContain('top-secret-key');
  expect(buf.toString('utf8')).toContain('qwen3-6-35b-a3b');

  // wipe runtime config, then restore from the file
  await page.evaluate(() => localStorage.removeItem('inventory.provider'));
  await page.setInputFiles('input[type="file"]', {
    name: 'backup.sqlite',
    mimeType: 'application/x-sqlite3',
    buffer: buf,
  });
  await expect(page.getByRole('status')).toContainText('Imported');

  await page.goto('/#/settings');
  await expect(page.getByLabel('Base URL')).toHaveValue('https://api.example.com/v1');
  await expect(page.getByLabel('API key')).toHaveValue('top-secret-key');
  await expect(page.getByLabel('Model')).toHaveValue('qwen3-6-35b-a3b');
});