import { expect, request, test, type Page } from '@playwright/test';

import { apiBaseURL } from './test-env';

const authTokenStorageKey = 'pulse-auth-token';
const testPassword = 'super-secret-password';

test.use({ timezoneId: 'America/Detroit' });

type WeightFixture = {
  date: string;
  weight: number;
};

const addDays = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const detroitDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Detroit',
    year: 'numeric',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};

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

async function createUserWithWeights(snapshotDate: string, weights: WeightFixture[]) {
  const apiContext = await request.newContext({ baseURL: apiBaseURL });

  try {
    const registerResponse = await apiContext.post('/api/v1/auth/register', {
      data: {
        password: testPassword,
        username: `trend-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      },
    });
    const registerBody = await registerResponse.text();
    expect(registerResponse.ok(), registerBody).toBeTruthy();

    const registerPayload = JSON.parse(registerBody) as {
      data: { token: string };
    };
    const authorization = `Bearer ${registerPayload.data.token}`;

    for (const weight of weights) {
      const response = await apiContext.post('/api/v1/weight', {
        data: { ...weight, unit: 'lbs' },
        headers: { authorization },
      });
      expect(response.ok()).toBeTruthy();
    }

    const snapshotResponse = await apiContext.get(
      `/api/v1/dashboard/snapshot?date=${snapshotDate}`,
      { headers: { authorization } },
    );
    expect(snapshotResponse.ok()).toBeTruthy();

    const snapshotPayload = (await snapshotResponse.json()) as {
      data: {
        weight: {
          value: number;
          trendValue: number | null;
          date: string;
          unit: 'lbs' | 'kg';
        } | null;
      };
    };

    return {
      authToken: registerPayload.data.token,
      snapshotWeight: snapshotPayload.data.weight,
    };
  } finally {
    await apiContext.dispose();
  }
}

async function authenticatePage(page: Page, authToken: string) {
  await page.addInitScript(
    ([storageKey, token]) => {
      window.localStorage.setItem(storageKey, token);
    },
    [authTokenStorageKey, authToken] as const,
  );
}

const getWeightCard = (page: Page, label: 'Latest Weight' | 'Trend Weight') =>
  page
    .locator('[data-slot="dashboard-snapshot-panel"]')
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::*[@data-slot="stat-card"]');

const waitForSnapshotResponse = (page: Page, snapshotDate: string) =>
  page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      url.pathname === '/api/v1/dashboard/snapshot' &&
      url.searchParams.get('date') === snapshotDate
    );
  });

test('dashboard trend weight excludes sparse measurements older than 30 calendar days', async ({
  page,
}) => {
  const snapshotDate = detroitDateKey();
  const assertPageClean = monitorPage(page);
  const { authToken, snapshotWeight } = await createUserWithWeights(snapshotDate, [
    { date: addDays(snapshotDate, -30), weight: 225 },
    { date: addDays(snapshotDate, -60), weight: 210 },
    { date: addDays(snapshotDate, -29), weight: 178 },
    { date: addDays(snapshotDate, -9), weight: 177 },
    { date: addDays(snapshotDate, -3), weight: 178 },
    { date: snapshotDate, weight: 176 },
  ]);

  expect(snapshotWeight).toMatchObject({
    date: snapshotDate,
    unit: 'lbs',
    value: 176,
  });
  expect(snapshotWeight?.trendValue).toBeCloseTo(177.719, 3);

  await authenticatePage(page, authToken);
  const snapshotResponsePromise = waitForSnapshotResponse(page, snapshotDate);
  await page.goto('/');
  const snapshotResponse = await snapshotResponsePromise;

  expect(snapshotResponse.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(getWeightCard(page, 'Trend Weight')).toContainText('177.7 lbs');
  assertPageClean();
});

test('dashboard shows the latest scale weight when the trend window has only one entry', async ({
  page,
}) => {
  const snapshotDate = detroitDateKey();
  await page.setViewportSize({ height: 812, width: 375 });
  const assertPageClean = monitorPage(page);
  const { authToken, snapshotWeight } = await createUserWithWeights(snapshotDate, [
    { date: addDays(snapshotDate, -90), weight: 220 },
    { date: addDays(snapshotDate, -5), weight: 181 },
  ]);

  expect(snapshotWeight).toEqual({
    date: addDays(snapshotDate, -5),
    trendValue: null,
    unit: 'lbs',
    value: 181,
  });

  await authenticatePage(page, authToken);
  const snapshotResponsePromise = waitForSnapshotResponse(page, snapshotDate);
  await page.goto('/');
  const snapshotResponse = await snapshotResponsePromise;

  expect(snapshotResponse.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  const weightCard = getWeightCard(page, 'Latest Weight');
  await expect(weightCard).toContainText('181 lbs');
  expect(
    await weightCard.evaluate((element) => element.scrollWidth <= element.clientWidth),
    'Latest Weight card should not overflow horizontally',
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    'dashboard should not overflow horizontally',
  ).toBe(true);
  await page.waitForLoadState('networkidle');

  const weightHistoryLink = weightCard
    .locator('..')
    .getByRole('link', { name: 'View weight history' });
  await weightHistoryLink.focus();
  await weightHistoryLink.press('Enter');

  await expect(page).toHaveURL(/\/weight\/history$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Weight History' })).toBeVisible();
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByRole('heading', { name: 'Weight history help' })).toBeVisible();
  await expect(
    page.getByText(
      'The dashboard computes its EWMA from the trailing 30 calendar days. With fewer than two measurements in that window, it shows your latest weight instead.',
    ),
  ).toBeVisible();
  assertPageClean();
});
