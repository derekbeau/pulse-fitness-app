import { expect, request, test, type Page } from '@playwright/test';

const authTokenStorageKey = 'pulse-auth-token';
const apiBaseURL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const testUsername = `habits-e2e-${Date.now()}`;
const testPassword = 'super-secret-password';

let authToken = '';

async function seedTestUser() {
  const apiContext = await request.newContext({ baseURL: apiBaseURL });

  try {
    const response = await apiContext.post('/api/v1/auth/register', {
      data: {
        password: testPassword,
        username: testUsername,
      },
    });
    expect(response.ok()).toBeTruthy();

    const payload = (await response.json()) as {
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

test.describe.serial('habits flow', () => {
  test.beforeAll(async () => {
    await seedTestUser();
  });

  test('creates a boolean habit from settings', async ({ page }) => {
    await authenticatePage(page);
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Add habit' }).first().click();
    await page.getByLabel('Habit name').fill('Meditate');
    await page.getByLabel('Tracking type').selectOption('boolean');
    await page.getByRole('button', { exact: true, name: 'Save' }).click();

    await expect(page.getByRole('heading', { level: 3, name: 'Meditate' })).toBeVisible();
  });

  test('tracks a boolean habit and reflects it on the dashboard', async ({ page }) => {
    await authenticatePage(page);
    await page.goto('/habits');

    const meditateCheckbox = page.getByLabel('Meditate');

    await meditateCheckbox.click();
    await expect(meditateCheckbox).toHaveAttribute('data-state', 'checked');

    await page.reload();
    await expect(page.getByLabel('Meditate')).toHaveAttribute('data-state', 'checked');

    await page.goto('/');
    await expect(page.getByText('1 / 1 complete')).toBeVisible();
    await expect(page.getByText('100%')).toBeVisible();
    await expect(page.getByLabel(/Meditate \d{4}-\d{2}-\d{2} Completed/)).toBeVisible();
  });

  test('creates and tracks a numeric habit', async ({ page }) => {
    await authenticatePage(page);
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Add habit' }).first().click();
    await page.getByLabel('Habit name').fill('Water (glasses)');
    await page.getByLabel('Tracking type').selectOption('numeric');
    await page.getByLabel('Target').fill('8');
    await page.getByLabel('Unit').fill('glasses');
    await page.getByRole('button', { exact: true, name: 'Save' }).click();

    await expect(page.getByRole('heading', { level: 3, name: 'Water (glasses)' })).toBeVisible();

    await page.goto('/habits');

    const waterInput = page.getByLabel('Water (glasses)');

    await waterInput.fill('6');
    await waterInput.blur();

    await expect(page.getByText('6 / 8 glasses', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('75%', { exact: true }).first()).toBeVisible();
  });
});
