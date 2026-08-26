import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type { FoodAnalyticsResponse } from '@pulse/shared';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { adaptivePreviewFixtureContract } from './adaptive-preview-fixture-contract';
import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'America/Detroit' });
test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

const username = 'adaptive-preview-food';
const password = 'adaptive-preview-only';
const fixtureDate = adaptivePreviewFixtureContract.anchorDate;
const yogurtId = 'f1500000-0000-4000-8000-000000000001';
let api: APIRequestContext;
let token = '';
let agentToken: { id: string; token: string } | undefined;

function monitorPage(page: Page, allowedHttpFailures: string[] = []) {
  const failures: string[] = [];
  let remainingExpectedResourceErrors = allowedHttpFailures.filter((failure) =>
    failure.endsWith(' 503'),
  ).length;
  const remainingAllowed = new Map<string, number>();
  for (const failure of allowedHttpFailures) {
    remainingAllowed.set(failure, (remainingAllowed.get(failure) ?? 0) + 1);
  }
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      if (
        message.type() === 'error' &&
        message.text() ===
          'Failed to load resource: the server responded with a status of 503 (Service Unavailable)' &&
        remainingExpectedResourceErrors > 0
      ) {
        remainingExpectedResourceErrors -= 1;
        return;
      }
      failures.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (requestValue) =>
    failures.push(
      `requestfailed: ${requestValue.method()} ${requestValue.url()} ${requestValue.failure()?.errorText ?? ''}`,
    ),
  );
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    const key = `${response.request().method()} ${url.pathname} ${response.status()}`;
    const remaining = remainingAllowed.get(key) ?? 0;
    if (remaining > 0) {
      if (remaining === 1) remainingAllowed.delete(key);
      else remainingAllowed.set(key, remaining - 1);
      return;
    }
    failures.push(`http ${response.status()}: ${response.url()}`);
  });
  return () => {
    expect(failures, 'browser diagnostics').toEqual([]);
    expect([...remainingAllowed.entries()], 'expected browser failures exercised').toEqual([]);
    expect(remainingExpectedResourceErrors, 'expected resource errors exercised').toBe(0);
  };
}

async function capture(page: Page, filename: string) {
  const directory = resolve(process.cwd(), '../../artifacts/issue-115');
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ fullPage: true, path: resolve(directory, filename) });
}

async function captureElement(page: Page, selector: string, filename: string) {
  const directory = resolve(process.cwd(), '../../artifacts/issue-115');
  mkdirSync(directory, { recursive: true });
  await page.locator(selector).screenshot({ path: resolve(directory, filename) });
}

async function setTheme(page: Page, theme: 'light' | 'dark' | 'midnight') {
  await page.evaluate((value) => window.localStorage.setItem('pulse-theme', value), theme);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Food library analytics' })).toBeVisible();
  const rootClass = (await page.locator('html').getAttribute('class')) ?? '';
  expect(rootClass.includes('dark')).toBe(theme === 'dark');
  expect(rootClass.includes('theme-midnight')).toBe(theme === 'midnight');
}

async function openAnalytics(page: Page) {
  await page.clock.setFixedTime(new Date(adaptivePreviewFixtureContract.serverNow));
  await setAuthenticatedSession(page, token);
  const response = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === '/api/v1/foods/analytics' && candidate.status() === 200,
  );
  await page.goto('/nutrition?view=foods&foodMode=analytics', { waitUntil: 'domcontentloaded' });
  await response;
  await expect(page.getByRole('heading', { level: 1, name: 'Nutrition' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Food library analytics' })).toBeVisible();
  await page.waitForLoadState('networkidle');
}

async function expectNoOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    `${width}px page overflow`,
  ).toBe(true);
  if (width < 1024) {
    const cards = page.getByTestId('food-analytics-card');
    for (let index = 0; index < (await cards.count()); index += 1) {
      const card = cards.nth(index);
      expect(
        await card.evaluate((element) => element.scrollWidth <= element.clientWidth),
        `${width}px analytics card ${index} clipping`,
      ).toBe(true);
      const meaningful = card.locator(
        '[data-slot="badge"], [data-testid="food-analytics-card-metric"], button',
      );
      for (let childIndex = 0; childIndex < (await meaningful.count()); childIndex += 1) {
        const child = meaningful.nth(childIndex);
        expect(
          await child.evaluate((element) => element.scrollWidth <= element.clientWidth),
          `${width}px analytics card ${index} child ${childIndex} clipping`,
        ).toBe(true);
      }
    }
  }
  if (width === 768) {
    const searchBox = await page.getByRole('textbox', { name: 'Search saved foods' }).boundingBox();
    expect(
      searchBox?.width,
      '768px search remains usable inside the sidebar layout',
    ).toBeGreaterThan(240);
  }
  for (const name of ['30D', '90D', 'All']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box?.height, `${name} touch target at ${width}px`).toBeGreaterThanOrEqual(44);
  }
}

test.beforeAll(async () => {
  api = await request.newContext({ baseURL: apiBaseURL });
  const login = await api.post('/api/v1/auth/login', { data: { username, password } });
  expect(login.ok(), await login.text()).toBeTruthy();
  token = ((await login.json()) as { data: { token: string } }).data.token;
  const created = await api.post('/api/v1/agent-tokens', {
    data: { name: 'Food analytics browser parity' },
    headers: { authorization: `Bearer ${token}` },
  });
  expect(created.status(), await created.text()).toBe(201);
  agentToken = ((await created.json()) as { data: { id: string; token: string } }).data;
});

test.afterAll(async () => {
  if (token) {
    await api.patch(`/api/v1/foods/${yogurtId}`, {
      data: { calories: 150 },
      headers: { authorization: `Bearer ${token}` },
    });
  }
  if (agentToken) {
    await api.delete(`/api/v1/agent-tokens/${agentToken.id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
  }
  await api.dispose();
});

test('renders exact contribution truth, all server filters, pagination, keyboard states, and deep links', async ({
  page,
}) => {
  const diagnostics = monitorPage(page);
  if (!agentToken) throw new Error('Expected the food analytics AgentToken fixture');
  const analyticsPath = `/api/v1/foods/analytics?range=30d&end=${fixtureDate}&timeZone=America%2FDetroit`;
  const [jwtResponse, agentResponse] = await Promise.all([
    api.get(analyticsPath, { headers: { authorization: `Bearer ${token}` } }),
    api.get(analyticsPath, {
      headers: { authorization: `AgentToken ${agentToken.token}` },
    }),
  ]);
  expect(jwtResponse.ok(), await jwtResponse.text()).toBeTruthy();
  expect(agentResponse.ok(), await agentResponse.text()).toBeTruthy();
  const jwtBody = (await jwtResponse.json()) as FoodAnalyticsResponse;
  expect(await agentResponse.json()).toEqual(jwtBody);
  expect(jwtBody.data.summary).toMatchObject({
    savedFoodsTotal: 7,
    savedFoodsUsed: 6,
    linkedUsageOccurrences: 9,
    distinctLoggedDays: 5,
    linkedFoodCalories: 1620,
    totalMealItemCalories: 1775,
    unlinkedMealItemCount: 1,
    inactiveLinkedMealItemCount: 1,
    definitionsNeedingReview: 4,
  });

  await page.setViewportSize({ width: 390, height: 1000 });
  await openAnalytics(page);
  const analyticsTab = page.getByRole('tab', { name: 'Analytics' });
  await analyticsTab.focus();
  const libraryResponse = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === '/api/v1/foods' && candidate.status() === 200,
  );
  await page.keyboard.press('Home');
  await libraryResponse;
  await expect(page.getByRole('tab', { name: 'Library' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(analyticsTab).toHaveAttribute('aria-selected', 'true');
  await expect(analyticsTab).toBeFocused();
  await expect(page.getByText('6 of 7')).toBeVisible();
  await expect(page.getByText('91.3%')).toBeVisible();
  await expect(page.getByText('Of all meal-item calories')).toBeVisible();
  await expect(page.getByText('4', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('No saved foods yet')).toHaveCount(0);

  await setTheme(page, 'light');
  await expectNoOverflow(page, 320);
  await capture(page, 'food-analytics-summary-320-light.png');

  await setTheme(page, 'dark');
  await expectNoOverflow(page, 390);
  await capture(page, 'food-analytics-cards-390-dark.png');

  await setTheme(page, 'midnight');
  await expectNoOverflow(page, 430);
  const mobileOpen = page.getByRole('button', { name: /Greek Yogurt analytics|Greek Yogurt/u });
  await mobileOpen.click();
  await expect(page.getByRole('heading', { name: 'Current definition' })).toBeVisible();
  const sheet = page.locator('[data-slot="sheet-content"]');
  expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await captureElement(
    page,
    '[data-slot="sheet-content"]',
    'food-analytics-detail-430-midnight-top.png',
  );
  await sheet.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await captureElement(
    page,
    '[data-slot="sheet-content"]',
    'food-analytics-detail-430-midnight-bottom.png',
  );
  await page.keyboard.press('Escape');
  await expect(mobileOpen).toBeFocused();

  await setTheme(page, 'light');
  await expectNoOverflow(page, 768);
  await capture(page, 'food-analytics-cards-768-light.png');
  await expectNoOverflow(page, 1280);
  const tableRegion = page.getByTestId('food-analytics-table-region');
  await expect(page.getByText(/More columns are available horizontally/u)).toBeVisible();
  await tableRegion.focus();
  await expect(tableRegion).toBeFocused();
  const tableGeometry = await tableRegion.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  if (tableGeometry.scrollWidth > tableGeometry.clientWidth) {
    const initialTableScroll = await tableRegion.evaluate((element) => element.scrollLeft);
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(() => tableRegion.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(initialTableScroll);
  } else {
    await expect(page.getByRole('columnheader', { name: 'Review' })).toBeVisible();
  }
  await tableRegion.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await capture(page, 'food-analytics-table-1280-light.png');

  await page.setViewportSize({ width: 1280, height: 1000 });
  const searchInput = page.getByRole('textbox', { name: 'Search saved foods' });
  await searchInput.pressSequentially('Trail');
  await searchInput.press('Space');
  await expect(searchInput).toHaveValue('Trail ');
  const filteredResponse = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === '/api/v1/foods/analytics' &&
      new URL(candidate.url()).searchParams.get('q') === 'Trail Mix' &&
      candidate.status() === 200,
  );
  await searchInput.pressSequentially('Mix');
  expect(
    ((await (await filteredResponse).json()) as FoodAnalyticsResponse).data.items,
  ).toHaveLength(1);
  await expect(page.getByText('6 of 7')).toBeVisible();
  await searchInput.fill('');
  await expect(page.getByRole('button', { name: /Greek Yogurt/u }).last()).toBeVisible();

  const filtersDisclosure = page.locator('details').filter({ hasText: 'Filters' });
  if (!(await filtersDisclosure.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await filtersDisclosure.locator('summary').click();
  }
  await expect(filtersDisclosure).toHaveAttribute('open', '');
  const exerciseFilter = async (label: string, value: string, expectedName: string) => {
    const response = page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname === '/api/v1/foods/analytics' &&
        [...new URL(candidate.url()).searchParams.values()].includes(value) &&
        candidate.status() === 200,
    );
    await page.getByLabel(label, { exact: true }).selectOption(value);
    await response;
    await expect(
      page.getByRole('button', { name: new RegExp(expectedName, 'u') }).last(),
    ).toBeVisible();
  };
  const resetFilter = async (label: string) => {
    await page.getByLabel(label, { exact: true }).selectOption('any');
    await expect(page.getByRole('button', { name: /Greek Yogurt/u }).last()).toBeVisible();
  };
  await exerciseFilter('Usage', 'unused', 'Unused Pantry Food');
  await resetFilter('Usage');
  await exerciseFilter('Verification', 'unverified', 'Trail Mix');
  await resetFilter('Verification');
  await exerciseFilter('Review', 'clear', 'Protein Bar');
  await resetFilter('Review');
  await exerciseFilter('Serving grams', 'missing_grams', 'Trail Mix');
  await resetFilter('Serving grams');
  const tagResponse = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === '/api/v1/foods/analytics' &&
      new URL(candidate.url()).searchParams.get('tags') === 'protein' &&
      candidate.status() === 200,
  );
  await page.getByLabel('protein', { exact: true }).click();
  await tagResponse;
  await expect(page.getByRole('button', { name: /Greek Yogurt/u }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('button', { name: /Greek Yogurt/u }).last()).toBeVisible();

  const perPageResponse = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === '/api/v1/foods/analytics' &&
      new URL(candidate.url()).searchParams.get('limit') === '5' &&
      candidate.status() === 200,
  );
  await page.getByLabel('Foods per analytics page').click();
  await page.getByRole('option', { name: '5 / page', exact: true }).click();
  await perPageResponse;
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  const pageTwoResponse = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === '/api/v1/foods/analytics' &&
      new URL(candidate.url()).searchParams.get('page') === '2' &&
      candidate.status() === 200,
  );
  await page.getByRole('button', { name: 'Next' }).click();
  const pageTwo = (await (await pageTwoResponse).json()) as FoodAnalyticsResponse;
  expect(pageTwo.meta).toEqual({ page: 2, limit: 5, total: 7 });
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  const resetPage = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === '/api/v1/foods/analytics' &&
      new URL(candidate.url()).searchParams.get('range') === '90d' &&
      new URL(candidate.url()).searchParams.get('page') === '1' &&
      candidate.status() === 200,
  );
  const ninetyResponse = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === '/api/v1/foods/analytics' &&
      new URL(candidate.url()).searchParams.get('range') === '90d' &&
      candidate.status() === 200,
  );
  await page.getByRole('button', { name: '90D', exact: true }).click();
  await resetPage;
  const ninety = (await (await ninetyResponse).json()) as FoodAnalyticsResponse;
  expect(ninety.data.summary.linkedUsageOccurrences).toBe(10);
  expect(ninety.data.summary.linkedFoodCalories).toBe(2619);
  await expect(page.getByRole('button', { name: '90D', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const allResponse = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === '/api/v1/foods/analytics' &&
      new URL(candidate.url()).searchParams.get('range') === 'all' &&
      candidate.status() === 200,
  );
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const all = (await (await allResponse).json()) as FoodAnalyticsResponse;
  expect(all.data.range).toMatchObject({ kind: 'all', startDate: '2026-07-24' });
  expect(all.data.summary.linkedUsageOccurrences).toBe(10);
  await page.getByRole('button', { name: '90D', exact: true }).click();
  await expect(page.getByRole('button', { name: '90D', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const densityResponse = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === '/api/v1/foods/analytics' &&
      new URL(candidate.url()).searchParams.get('sort') === 'protein_density' &&
      candidate.status() === 200,
  );
  await page.getByLabel('Sort foods').selectOption('protein_density');
  expect(
    ((await (await densityResponse).json()) as FoodAnalyticsResponse).data.items[0]?.name,
  ).toBe('Greek Yogurt');
  await expect(
    page.getByRole('columnheader', { name: 'Observed protein density' }),
  ).toHaveAttribute('aria-sort', 'descending');

  await page.getByRole('button', { name: /Greek Yogurt analytics|Greek Yogurt/u }).click();
  await expect(page.getByRole('heading', { name: 'Current definition' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Observed in 90D' })).toBeVisible();
  await expect(page.getByText('Not comparable · Logged units differ.').first()).toBeVisible();
  await expect(page.getByText(/Complete 3 · Partial 1 · Unknown 1/)).toBeVisible();
  await expect(page.getByText(/g carbs · .*g fat/u).first()).toBeVisible();
  const occurrenceLink = page.getByRole('link', { name: 'Open log' }).first();
  await expect(occurrenceLink).toHaveAttribute(
    'href',
    `/nutrition?view=log&date=2026-08-22&meal=f1520000-0000-4000-8000-000000000001`,
  );
  const nutritionResponse = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === '/api/v1/nutrition/2026-08-22' &&
      candidate.status() === 200,
  );
  await occurrenceLink.click();
  await nutritionResponse;
  await expect(page).toHaveURL(/view=log&date=2026-08-22&meal=f1520000/u);
  await expect(page.locator('#nutrition-meal-f1520000-0000-4000-8000-000000000001')).toBeFocused();
  await page.waitForLoadState('networkidle');
  diagnostics();
});

test('renders loading, list/detail retry, and empty-library states without weakening diagnostics', async ({
  page,
}) => {
  const diagnostics = monitorPage(page, [
    'GET /api/v1/foods/analytics 503',
    'GET /api/v1/foods/analytics 503',
    `GET /api/v1/foods/${yogurtId}/analytics 503`,
    `GET /api/v1/foods/${yogurtId}/analytics 503`,
  ]);
  await page.clock.setFixedTime(new Date(adaptivePreviewFixtureContract.serverNow));
  await setAuthenticatedSession(page, token);
  let releaseList: (() => void) | undefined;
  let listAttempts = 0;
  await page.route('**/api/v1/foods/analytics?**', async (route) => {
    listAttempts += 1;
    if (listAttempts <= 2) {
      if (listAttempts === 1) {
        await new Promise<void>((resolvePromise) => {
          releaseList = resolvePromise;
        });
      }
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'TEST_UNAVAILABLE', message: 'Try again' } }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto('/nutrition?view=foods&foodMode=analytics', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status', { name: 'Loading food analytics' })).toBeVisible();
  releaseList?.();
  await expect(page.getByText('Food analytics could not be loaded')).toBeVisible();
  const retryResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/foods/analytics' && response.status() === 200,
  );
  await page.getByRole('button', { name: 'Retry' }).click();
  await retryResponse;
  await expect(page.getByRole('heading', { name: 'Food library analytics' })).toBeVisible();

  let detailAttempts = 0;
  await page.route(`**/api/v1/foods/${yogurtId}/analytics?**`, async (route) => {
    detailAttempts += 1;
    if (detailAttempts <= 2) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'TEST_UNAVAILABLE', message: 'Try again' } }),
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: /Greek Yogurt analytics|Greek Yogurt/u }).click();
  await expect(page.getByText('Food detail could not be loaded')).toBeVisible();
  const detailRetry = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/foods/${yogurtId}/analytics` &&
      response.status() === 200,
  );
  await page.getByRole('button', { name: 'Retry' }).click();
  await detailRetry;
  await expect(page.getByRole('heading', { name: 'Current definition' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  diagnostics();
});

test('renders the no-library state from the strict analytics contract', async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.clock.setFixedTime(new Date(adaptivePreviewFixtureContract.serverNow));
  await setAuthenticatedSession(page, token);
  const empty: FoodAnalyticsResponse = {
    data: {
      range: {
        kind: '30d',
        startDate: '2026-07-25',
        endDate: fixtureDate,
        calendarDays: 30,
        timeZone: 'America/Detroit',
        timeZoneSource: 'request',
        isHistorical: false,
      },
      summary: {
        savedFoodsTotal: 0,
        savedFoodsUsed: 0,
        linkedUsageOccurrences: 0,
        distinctLoggedDays: 0,
        linkedFoodCalories: 0,
        totalMealItemCalories: 0,
        linkedCaloriesPercent: null,
        unlinkedMealItemCount: 0,
        unlinkedMealItemCalories: 0,
        inactiveLinkedMealItemCount: 0,
        inactiveLinkedMealItemCalories: 0,
        unresolvedLinkedMealItemCount: 0,
        unresolvedLinkedMealItemCalories: 0,
        definitionsNeedingReview: 0,
        dayStates: {
          complete: { occurrences: 0, distinctDays: 0 },
          partial: { occurrences: 0, distinctDays: 0 },
          unknown: { occurrences: 0, distinctDays: 0 },
        },
      },
      items: [],
      availableTags: [],
    },
    meta: { page: 1, limit: 10, total: 0 },
  };
  await page.route('**/api/v1/foods/analytics?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty) }),
  );
  await page.goto('/nutrition?view=foods&foodMode=analytics', { waitUntil: 'networkidle' });
  await expect(page.getByText('No saved foods yet')).toBeVisible();
  await expect(page.getByText('Foods saved through agent logging will appear here.')).toBeVisible();
  diagnostics();
});

test('edits the current definition without rewriting observed meal snapshots', async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.setViewportSize({ width: 430, height: 1000 });
  await openAnalytics(page);
  await page.getByRole('button', { name: /Greek Yogurt analytics|Greek Yogurt/u }).click();
  await page.getByRole('button', { name: 'Edit definition' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit food definition' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Calories').fill('160');
  const patchResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'PUT' &&
      new URL(candidate.url()).pathname === `/api/v1/foods/${yogurtId}` &&
      candidate.status() === 200,
  );
  await dialog.getByRole('button', { name: 'Save definition' }).click();
  await patchResponse;
  await expect(dialog).toBeHidden();
  await page.waitForLoadState('networkidle');

  const detailResponse = await api.get(
    `/api/v1/foods/${yogurtId}/analytics?range=30d&end=${fixtureDate}&timeZone=America%2FDetroit`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  expect(detailResponse.ok(), await detailResponse.text()).toBeTruthy();
  const detail = (await detailResponse.json()) as {
    data: {
      food: { currentDefinition: { calories: number }; observed: { totalCalories: number } };
    };
  };
  expect(detail.data.food.currentDefinition.calories).toBe(160);
  expect(detail.data.food.observed.totalCalories).toBe(570);
  await expect(
    page.getByRole('heading', { name: 'Current definition' }).locator('..'),
  ).toContainText('160 kcal');

  const restore = await api.patch(`/api/v1/foods/${yogurtId}`, {
    data: { calories: 150 },
    headers: { authorization: `Bearer ${token}` },
  });
  expect(restore.ok(), await restore.text()).toBeTruthy();
  diagnostics();
});
