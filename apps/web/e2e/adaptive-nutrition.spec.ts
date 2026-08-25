import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { adaptivePreviewFixtureContract } from './adaptive-preview-fixture-contract';
import { apiBaseURL } from './test-env';

const authTokenStorageKey = 'pulse-auth-token';
const testUsername = `atdee-${Date.now()}`;
const testPassword = 'super-secret-password';

let apiContext: APIRequestContext;
let authToken = '';

async function authenticatePage(page: Page, token = authToken) {
  await page.addInitScript(
    ([storageKey, token]) => window.localStorage.setItem(storageKey, token),
    [authTokenStorageKey, token] as const,
  );
}

async function postMeal(date: string, name: string, token = authToken, calories = 500) {
  const response = await apiContext.post(`/api/v1/nutrition/${date}/meals`, {
    data: {
      name,
      items: [
        {
          name: `${name} item`,
          amount: 1,
          unit: 'serving',
          calories,
          protein: 35,
          carbs: 55,
          fat: 15,
        },
      ],
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
}

async function registerUser(prefix: string) {
  const response = await apiContext.post('/api/v1/auth/register', {
    data: { password: testPassword, username: `${prefix}-${Date.now()}` },
  });
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { data: { token: string } };
  return payload.data.token;
}

function addDateDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function seedEligibleData() {
  const today = detroitDateKey();
  for (let offset = -21; offset <= -1; offset += 1) {
    const date = addDateDays(today, offset);
    await postMeal(date, `Complete day ${Math.abs(offset)}`, authToken, 2300);
    const statusResponse = await apiContext.patch(`/api/v1/nutrition/${date}/status`, {
      data: { status: 'complete' },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(statusResponse.ok()).toBeTruthy();
  }
  for (const [offset, weight] of [
    [-21, 182],
    [-18, 181.6],
    [-15, 181.2],
    [-12, 180.8],
    [-9, 180.4],
    [-6, 180],
    [-3, 179.5],
    [-1, 179.2],
  ] as const) {
    const response = await apiContext.post('/api/v1/weight', {
      data: { date: addDateDays(today, offset), unit: 'lbs', weight },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.ok()).toBeTruthy();
  }
}

function detroitDateKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Detroit',
    year: 'numeric',
  }).formatToParts(new Date(adaptivePreviewFixtureContract.serverNow));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

test.describe.serial('Adaptive TDEE Coach', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(adaptivePreviewFixtureContract.serverNow));
  });

  test.beforeAll(async () => {
    apiContext = await request.newContext({ baseURL: apiBaseURL });
    const response = await apiContext.post('/api/v1/auth/register', {
      data: { password: testPassword, username: testUsername },
    });
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as { data: { token: string } };
    authToken = payload.data.token;
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('sets up, reviews, accepts, and reopens an immutable baseline check-in', async ({
    page,
  }) => {
    await authenticatePage(page);
    await page.goto('/nutrition?view=coach');

    await expect(
      page.getByRole('heading', { level: 2, name: 'Set up Adaptive TDEE' }),
    ).toBeVisible();
    await page.getByLabel('Starting equation').selectOption('manual_tdee');
    await page.getByLabel('Starting TDEE (kcal/day)').fill('2450');
    await page.getByLabel('Current weight (lbs)').fill('180');
    await page
      .getByRole('radiogroup', { name: 'Goal direction' })
      .getByRole('radio', { name: /Maintain/ })
      .check();
    await page.getByRole('button', { name: 'Preview starting targets' }).click();

    await expect(
      page.getByRole('heading', { level: 2, name: 'A recommendation is ready' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Current and proposed targets' }),
    ).toBeVisible();
    await page.getByText('How Pulse calculated this').click();
    await expect(page.getByText('Starting plan')).toBeVisible();

    await page.getByRole('button', { name: 'Use these targets' }).click();
    const replacementDialog = page.getByRole('alertdialog');
    if (await replacementDialog.isVisible()) {
      await replacementDialog.getByRole('button', { name: 'Replace target' }).click();
    }

    await expect(page.getByText(/Targets accepted and applied from today/)).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'A stronger estimate is taking shape' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'View calculation' }).click();
    await expect(page.getByRole('dialog')).toContainText('Accepted');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'View calculation' })).toBeFocused();
  });

  test('shows equation baseline inputs and outputs before acceptance', async ({ page }) => {
    const equationToken = await registerUser('atdee-equation');
    await authenticatePage(page, equationToken);
    await page.goto('/nutrition?view=coach');

    await page.getByLabel('Birth date').fill('1990-02-28');
    await page.getByLabel('Starting activity level').selectOption('active');
    await page.getByLabel('Current weight (lbs)').fill('180');
    await page
      .getByRole('radiogroup', { name: 'Goal direction' })
      .getByRole('radio', { name: /Maintain/ })
      .check();
    await page.getByRole('button', { name: 'Preview starting targets' }).click();

    await expect(page.getByRole('button', { name: 'Use these targets' })).toBeVisible();
    await expect(page.getByText('Starting expenditure')).toBeVisible();
    const comparison = page.getByLabel('Recommendation comparison');
    await expect(comparison.getByText('Calories', { exact: true })).toBeVisible();
    await expect(comparison.getByText('Protein', { exact: true })).toBeVisible();
    await expect(comparison.getByText('Carbohydrates', { exact: true })).toBeVisible();
    await expect(comparison.getByText('Fat', { exact: true })).toBeVisible();

    await page.getByText('How Pulse calculated this').click();
    const setupDetails = page.getByRole('region', { name: 'Starting estimate details' });
    const rmrDetail = setupDetails.getByText('Estimated RMR').locator('..');
    await expect(rmrDetail).toContainText(/^Estimated RMR\d[\d,]* kcal$/);
    await expect(setupDetails.getByText('Activity multiplier')).toBeVisible();
    await expect(setupDetails.getByText('1.55')).toBeVisible();
    await expect(
      setupDetails.getByText(/multiple weeks of complete nutrition and weight data/i),
    ).toBeVisible();
  });

  test('shows the learning state while nutrition coverage is incomplete', async ({ page }) => {
    await authenticatePage(page);
    await page.goto('/nutrition?view=coach');
    await expect(
      page.getByRole('heading', { level: 2, name: 'A stronger estimate is taking shape' }),
    ).toBeVisible();
    await expect(page.getByText('0 / 12')).toBeVisible();
  });

  test('creates and accepts an eligible manual recommendation', async ({ page }) => {
    await seedEligibleData();
    await authenticatePage(page);
    await page.goto('/nutrition?view=coach');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Your Adaptive TDEE is active' }),
    ).toBeVisible();
    const nutritionProgress = page.getByRole('progressbar', {
      name: 'Complete nutrition: Usable with weight trend',
    });
    await expect(nutritionProgress).toContainText('21 / 12');
    await expect(nutritionProgress).toHaveAttribute('aria-valuenow', '12');
    await expect(nutritionProgress).toHaveAttribute(
      'aria-valuetext',
      '21 usable nutrition days; 12 required',
    );
    await page.getByRole('button', { name: 'Check in now' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Current and proposed targets' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Use these targets' }).click();
    const replacementDialog = page.getByRole('alertdialog');
    if (await replacementDialog.isVisible()) {
      await replacementDialog.getByRole('button', { name: 'Replace target' }).click();
    }
    await expect(page.getByText(/Targets accepted and applied from today/)).toBeVisible();
  });

  test('detects a stale recommendation after source data changes and refreshes safely', async ({
    page,
  }) => {
    await authenticatePage(page);
    await page.goto('/nutrition?view=coach');
    await page.getByRole('button', { name: 'Check in now' }).click();
    await expect(page.getByRole('button', { name: 'Use these targets' })).toBeVisible();
    await postMeal(addDateDays(detroitDateKey(), -1), 'Late correction');
    await page.getByRole('button', { name: 'Use these targets' }).click();
    const replacementDialog = page.getByRole('alertdialog');
    if (await replacementDialog.isVisible()) {
      await replacementDialog.getByRole('button', { name: 'Replace target' }).click();
    }
    await expect(page.getByText(/recommendation is out of date/i)).toBeVisible();
    await page.getByRole('button', { name: 'Refresh recommendation' }).click();
    await expect(page.getByText('Recommendation ready for review.')).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Current and proposed targets' }),
    ).toBeVisible();
  });

  test('marks today complete with confirmation and auto-downgrades after a meal change', async ({
    page,
  }) => {
    const today = detroitDateKey();
    await postMeal(today, 'Breakfast');
    await authenticatePage(page);
    await page.goto('/nutrition');

    await expect(page.getByRole('button', { name: /Unknown/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: /Complete/ }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Mark today complete?');
    await page.getByRole('button', { name: 'Mark complete' }).click();
    await expect(page.getByRole('button', { name: /Complete/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await postMeal(today, 'Dinner');
    await page.reload();
    await expect(page.getByRole('button', { name: /Partial/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('keeps the Coach usable without horizontal overflow at 375 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await authenticatePage(page);
    await page.goto('/nutrition?view=coach');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Current and proposed targets' }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('tab', { name: /Log/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /Coach/ })).toBeFocused();
  });

  test('supports keyboard-only setup and baseline acceptance', async ({ page }) => {
    const keyboardToken = await registerUser('atdee-key');
    await authenticatePage(page, keyboardToken);
    await page.goto('/nutrition?view=coach');

    await page.getByLabel('Starting equation').focus();
    await page.keyboard.type('Enter starting TDEE manually');
    await expect(page.getByLabel('Starting TDEE (kcal/day)')).toBeVisible();
    await page.getByLabel('Starting TDEE (kcal/day)').type('2450');
    await page.getByLabel('Current weight (lbs)').type('180');
    const goalDirection = page.getByRole('radiogroup', { name: 'Goal direction' });
    await goalDirection.getByRole('radio', { name: /Lose weight/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(goalDirection.getByRole('radio', { name: /Maintain/ })).toBeChecked();
    await page.getByRole('button', { name: 'Preview starting targets' }).press('Enter');
    await expect(page.getByRole('button', { name: 'Use these targets' })).toBeVisible();
    await page.getByRole('button', { name: 'Use these targets' }).press('Enter');
    const replacementDialog = page.getByRole('alertdialog');
    if (await replacementDialog.isVisible()) {
      await replacementDialog.getByRole('button', { name: 'Replace target' }).press('Enter');
    }
    await expect(page.getByText(/Targets accepted and applied from today/)).toBeVisible();
  });
});
