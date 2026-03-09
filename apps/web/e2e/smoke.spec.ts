import { expect, test } from '@playwright/test';

test('page loads and shows dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
