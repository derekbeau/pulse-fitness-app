import { expect, request, test, type Page } from '@playwright/test';

const authTokenStorageKey = 'pulse-auth-token';
const apiBaseURL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const testUsername = `smoke-e2e-${Date.now()}`;
const testPassword = 'super-secret-password';

let authToken = '';

async function seedTestUser() {
  const apiContext = await request.newContext({ baseURL: apiBaseURL });

  try {
    const registerResponse = await apiContext.post('/api/v1/auth/register', {
      data: {
        password: testPassword,
        username: testUsername,
      },
    });
    expect(registerResponse.ok()).toBeTruthy();

    const payload = (await registerResponse.json()) as {
      data: {
        token: string;
      };
    };
    authToken = payload.data.token;
  } finally {
    await apiContext.dispose();
  }
}

async function authenticatePage(page: Page) {
  await page.addInitScript(
    ([storageKey, token]) => {
      window.localStorage.setItem(storageKey, token);
    },
    [authTokenStorageKey, authToken] as const,
  );
}

test.beforeAll(async () => {
  await seedTestUser();
});

test('page loads and redirects guests to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('authenticated page loads and shows dashboard', async ({ page }) => {
  await authenticatePage(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
