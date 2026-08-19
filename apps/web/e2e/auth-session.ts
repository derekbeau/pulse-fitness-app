import type { Page } from '@playwright/test';

const authTokenStorageKey = 'pulse-auth-token';

export async function setAuthenticatedSession(page: Page, token: string) {
  if (page.url() === 'about:blank') {
    await page.goto('/login', { waitUntil: 'networkidle' });
  } else {
    await page.waitForLoadState('networkidle');
  }
  await page.evaluate(([storageKey, value]) => window.localStorage.setItem(storageKey, value), [
    authTokenStorageKey,
    token,
  ] as const);
}
