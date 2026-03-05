import { expect, test } from '@playwright/test';

test('page loads and shows Hello Pulse', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Hello Pulse');
});
