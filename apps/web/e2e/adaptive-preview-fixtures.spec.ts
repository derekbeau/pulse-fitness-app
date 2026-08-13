import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { apiBaseURL } from './test-env';

const authTokenStorageKey = 'pulse-auth-token';
const fixturePassword = 'adaptive-preview-only';
const fixtureNames = [
  'setup',
  'baseline',
  'learning',
  'updating',
  'holding',
  'pending',
  'goal-reached',
] as const;
type FixtureName = (typeof fixtureNames)[number];

let apiContext: APIRequestContext;
const tokens = new Map<FixtureName, string>();

async function authenticateFixture(page: Page, fixture: FixtureName) {
  const token = tokens.get(fixture);
  if (!token) throw new Error(`Missing authentication token for ${fixture}`);
  await page.addInitScript(
    ([storageKey, value]) => window.localStorage.setItem(storageKey, value),
    [authTokenStorageKey, token] as const,
  );
}

function monitorPage(page: Page) {
  const consoleFailures: string[] = [];
  const networkFailures: string[] = [];
  const pageFailures: string[] = [];
  const responseFailures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleFailures.push(
        `${message.type()}: ${message.text()} (${message.location().url || 'unknown source'})`,
      );
    }
  });
  page.on('pageerror', (error) => pageFailures.push(error.message));
  page.on('requestfailed', (requestFailure) => {
    networkFailures.push(
      `${requestFailure.method()} ${requestFailure.url()}: ${requestFailure.failure()?.errorText}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      responseFailures.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });
  return () => {
    expect(consoleFailures, 'browser console warnings/errors').toEqual([]);
    expect(pageFailures, 'uncaught browser errors').toEqual([]);
    expect(networkFailures, 'failed browser network requests').toEqual([]);
    expect(responseFailures, 'HTTP responses with failure status').toEqual([]);
  };
}

async function openCoach(page: Page, fixture: FixtureName) {
  await authenticateFixture(page, fixture);
  await page.goto('/nutrition?view=coach');
  await expect(page.getByRole('heading', { level: 1, name: 'Nutrition' })).toBeVisible();
}

async function acceptWithSameDateConfirmation(page: Page) {
  await page.getByRole('button', { name: 'Use these targets' }).click();
  const replacementDialog = page.getByRole('alertdialog');
  if (await replacementDialog.isVisible()) {
    await replacementDialog.getByRole('button', { name: 'Replace target' }).click();
  }
}

test.describe.serial('Adaptive TDEE deterministic preview fixtures', () => {
  test.beforeAll(async () => {
    apiContext = await request.newContext({ baseURL: apiBaseURL });
    for (const fixture of fixtureNames) {
      const response = await apiContext.post('/api/v1/auth/login', {
        data: {
          password: fixturePassword,
          username: `adaptive-preview-${fixture}`,
        },
      });
      expect(response.ok(), `${fixture} fixture login`).toBeTruthy();
      const payload = (await response.json()) as { data: { token: string } };
      tokens.set(fixture, payload.data.token);
    }
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('renders setup, baseline, learning, eligible, and held states', async ({ page }) => {
    const assertDiagnostics = monitorPage(page);

    await openCoach(page, 'setup');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Set up Adaptive TDEE' }),
    ).toBeVisible();

    await openCoach(page, 'baseline');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Your baseline is active' }),
    ).toBeVisible();

    await openCoach(page, 'learning');
    await expect(
      page.getByRole('heading', { level: 2, name: 'A stronger estimate is taking shape' }),
    ).toBeVisible();

    await openCoach(page, 'updating');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Your Adaptive TDEE is active' }),
    ).toBeVisible();
    await expect(page.getByText('12 / 12')).toBeVisible();

    await openCoach(page, 'holding');
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Pulse needs better data before changing targets',
      }),
    ).toBeVisible();
    await expect(page.getByText('Why Pulse is holding')).toBeVisible();

    assertDiagnostics();
  });

  test('declines, audits history, creates a replacement preview, and accepts it', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page);
    await openCoach(page, 'pending');
    await expect(
      page.getByRole('heading', { level: 2, name: 'A recommendation is ready' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Keep current' }).click();
    await expect(page.getByText('Current targets kept.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Check-in history' })).toBeVisible();
    await expect(page.getByText('Kept current', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'View calculation' }).first().click();
    await expect(page.getByRole('dialog')).toContainText('Kept current');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Check in now' }).click();
    await expect(page.getByText('Recommendation ready for review.')).toBeVisible();
    await acceptWithSameDateConfirmation(page);
    await expect(page.getByText(/Targets accepted and applied from today/)).toBeVisible();
    await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();

    assertDiagnostics();
  });

  test('accepts a reached goal and moves the program to maintenance', async ({ page }) => {
    const assertDiagnostics = monitorPage(page);
    await openCoach(page, 'goal-reached');
    await expect(page.getByText('Goal reached', { exact: true })).toBeVisible();

    await acceptWithSameDateConfirmation(page);
    await expect(page.getByText(/program is now in maintenance/i)).toBeVisible();
    await expect(page.getByText('Maintain', { exact: true }).first()).toBeVisible();

    assertDiagnostics();
  });

  test('has no horizontal overflow at every required acceptance width', async ({ page }) => {
    const assertDiagnostics = monitorPage(page);
    await authenticateFixture(page, 'setup');

    for (const width of [320, 375, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await page.goto('/nutrition?view=coach');
      await expect(
        page.getByRole('heading', { level: 2, name: 'Set up Adaptive TDEE' }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `horizontal overflow at ${width}px`,
      ).toBe(true);
    }

    assertDiagnostics();
  });
});
