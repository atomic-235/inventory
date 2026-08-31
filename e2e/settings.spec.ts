import { test, expect } from '@playwright/test';

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