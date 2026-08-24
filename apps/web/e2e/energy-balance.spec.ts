import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'America/Detroit' });

const fixturePassword = 'adaptive-preview-only';
type Fixture =
  | 'baseline'
  | 'updating'
  | 'holding'
  | 'learning'
  | 'analytics-pending'
  | 'analytics-goal-loss';

let apiContext: APIRequestContext;
const tokens = new Map<Fixture, string>();
const fixtureDate = '2026-08-23';

function datePlus(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function fixtureUsername(fixture: Fixture) {
  if (fixture === 'analytics-pending') return 'adaptive-preview-eb-pending';
  if (fixture === 'analytics-goal-loss') return 'adaptive-preview-eb-loss';
  return `adaptive-preview-${fixture}`;
}

function monitorPage(page: Page, options: { allowExpectedAnalytics503?: boolean } = {}) {
  const failures: string[] = [];
  const isOptionalFontCdn = (url: string) => new URL(url).hostname === 'fonts.gstatic.com';
  page.on('console', (message) => {
    const isExpectedAnalytics503Console =
      options.allowExpectedAnalytics503 === true &&
      message.type() === 'error' &&
      message.text() ===
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)';
    if (
      (message.type() === 'error' || message.type() === 'warning') &&
      !isExpectedAnalytics503Console
    ) {
      failures.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (requestFailure) => {
    const requestUrl = new URL(requestFailure.url());
    const isNavigationAbortedViteModule =
      requestFailure.failure()?.errorText === 'net::ERR_ABORTED' &&
      requestUrl.origin === 'http://127.0.0.1:5274' &&
      (requestUrl.pathname.startsWith('/src/') ||
        requestUrl.pathname.startsWith('/node_modules/.vite/'));
    if (!isOptionalFontCdn(requestFailure.url()) && !isNavigationAbortedViteModule) {
      failures.push(
        `requestfailed: ${requestFailure.method()} ${requestFailure.url()} ${requestFailure.failure()?.errorText ?? ''}`,
      );
    }
  });
  page.on('response', (response) => {
    const expectedAnalytics503 =
      options.allowExpectedAnalytics503 === true &&
      response.status() === 503 &&
      new URL(response.url()).pathname === '/api/v1/adaptive-nutrition/analytics';
    if (response.status() >= 400 && !isOptionalFontCdn(response.url()) && !expectedAnalytics503) {
      failures.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  return () => expect(failures, 'browser diagnostics').toEqual([]);
}

async function authenticate(page: Page, fixture: Fixture) {
  const token = tokens.get(fixture);
  if (!token) throw new Error(`Missing ${fixture} token`);
  await setAuthenticatedSession(page, token);
}

async function openAnalytics(page: Page, fixture: Fixture, end?: string) {
  await authenticate(page, fixture);
  const response = page.waitForResponse(
    (value) =>
      value.url().includes('/api/v1/adaptive-nutrition/analytics?') &&
      value.request().method() === 'GET' &&
      value.status() === 200,
  );
  await page.goto(`/nutrition/energy-balance${end ? `?end=${end}` : ''}`, {
    waitUntil: 'networkidle',
  });
  await response;
  await expect(
    page.getByRole('heading', { level: 1, name: 'Energy Balance & Expenditure' }),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
}

test.describe.serial('Energy Balance & Expenditure analytics', () => {
  test.beforeAll(async () => {
    apiContext = await request.newContext({ baseURL: apiBaseURL });
    for (const fixture of [
      'updating',
      'holding',
      'learning',
      'baseline',
      'analytics-pending',
      'analytics-goal-loss',
    ] as const) {
      const response = await apiContext.post('/api/v1/auth/login', {
        data: { password: fixturePassword, username: fixtureUsername(fixture) },
      });
      expect(response.ok(), `${fixture} login`).toBeTruthy();
      const payload = (await response.json()) as { data: { token: string } };
      tokens.set(fixture, payload.data.token);
    }
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('renders updating analytics and supports keyboard-only range and comparison controls', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page);
    await openAnalytics(page, 'analytics-goal-loss', fixtureDate);

    const hero = page.locator('[data-slot="energy-state-hero"]');
    await expect(hero.getByText('Updating', { exact: true })).toBeVisible();
    await expect(hero.getByText(/2,500\s*kcal\/day/)).toBeVisible();
    await expect(page.getByText('Selected-range summary')).toBeVisible();
    await expect(page.getByText('+350 kcal')).toBeVisible();
    await expect(page.getByText('−100 kcal')).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Adaptive expenditure history chart' }),
    ).toBeVisible();
    await expect(page.getByText(/Gaps are intentional/)).toBeVisible();
    for (const width of [768, 1280]) {
      await page.setViewportSize({ height: 900, width });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
        ),
        `${width}px overflow`,
      ).toBe(true);
    }

    const oneWeek = page.getByRole('button', { name: '1W' });
    await oneWeek.focus();
    const oneWeekResponse = page.waitForResponse(
      (value) => value.url().includes('range=1w') && value.status() === 200,
    );
    await page.keyboard.press('Enter');
    const oneWeekPayload = (await (await oneWeekResponse).json()) as {
      data: {
        summary: {
          observedTrendEndDate: string;
          predictedModeledDays: number;
        };
      };
    };
    const expectedObservedEnd = datePlus(fixtureDate, -1);
    expect(oneWeekPayload.data.summary.predictedModeledDays).toBe(5);
    expect(oneWeekPayload.data.summary.observedTrendEndDate).toBe(expectedObservedEnd);
    await expect(oneWeek).toHaveAttribute('aria-pressed', 'true');
    await expect(oneWeek).toBeFocused();
    await expect(page.getByText(/One-week changes are especially sensitive/)).toBeVisible();
    await expect(page.getByText('Predicted · 5 daily intervals')).toBeVisible();
    await expect(
      page.getByText(new RegExp(`up to, but not including, ${displayDate(expectedObservedEnd)}`)),
    ).toBeVisible();

    const expenditure = page.getByRole('button', { name: 'Expenditure' });
    await expenditure.focus();
    await page.keyboard.press('Space');
    await expect(expenditure).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('img', { name: 'Complete intake compared with expenditure' }),
    ).toBeVisible();

    const tableDisclosure = page.getByText('View accessible data table');
    await tableDisclosure.focus();
    await page.keyboard.press('Enter');
    const dataTable = page.getByRole('table', { name: /Energy balance values/ });
    await expect(dataTable).toBeVisible();
    const endingObservationRow = dataTable.getByRole('row').filter({
      hasText: displayDate(expectedObservedEnd),
    });
    const endingObservationCells = endingObservationRow.getByRole('cell');
    await expect(endingObservationCells.nth(2)).toHaveText('2,400 kcal');
    await expect(endingObservationCells.nth(3)).toHaveText('2,400 kcal');
    await expect(endingObservationCells.nth(6)).not.toHaveText('Not enough data');
    assertDiagnostics();
  });

  test('shows a no-accepted-check-in baseline with honest empty and audit states', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page);
    await page.setViewportSize({ height: 844, width: 390 });
    const analyticsResponse = page.waitForResponse(
      (value) =>
        value.url().includes('/api/v1/adaptive-nutrition/analytics?') && value.status() === 200,
    );
    await openAnalytics(page, 'baseline');
    const payload = (await (await analyticsResponse).json()) as {
      data: {
        current: {
          expenditureSourceCheckInId: string | null;
          expenditureSourceInputFingerprint: string | null;
        };
        points: Array<{
          expenditureKcal: number | null;
          expenditureSourceCheckInId: string | null;
          periodStart: string;
        }>;
      };
    };

    await expect(page.getByText('Starting expenditure', { exact: true })).toBeVisible();
    await expect(page.getByText(/2,500\s*kcal\/day/)).toBeVisible();
    await expect(page.getByText(/Complete nutrition days will unlock/)).toBeVisible();
    expect(payload.data.current.expenditureSourceCheckInId).toBeNull();
    expect(payload.data.current.expenditureSourceInputFingerprint).toBeNull();
    const preProgramPoint = payload.data.points.find((point) => point.expenditureKcal === null);
    const programStartPoint = payload.data.points.find(
      (point) => point.expenditureKcal === 2500 && point.expenditureSourceCheckInId === null,
    );
    expect(preProgramPoint).toBeDefined();
    expect(programStartPoint).toBeDefined();
    if (!preProgramPoint || !programStartPoint) {
      throw new Error('Baseline fixture must include pre-program and program-start points');
    }
    const disclosure = page.getByText('View accessible data table');
    await disclosure.focus();
    await page.keyboard.press('Enter');
    const dataTable = page.getByRole('table', { name: /Energy balance values/ });
    const preProgramRow = dataTable
      .getByRole('row')
      .filter({ hasText: displayDate(preProgramPoint.periodStart) });
    await expect(preProgramRow.getByRole('cell').nth(5)).toHaveText('Not enough data');
    await expect(preProgramRow.getByRole('cell').nth(10)).toContainText('No expenditure estimate');
    const programStartRow = dataTable
      .getByRole('row')
      .filter({ hasText: displayDate(programStartPoint.periodStart) });
    await expect(programStartRow.getByRole('cell').nth(5)).toHaveText('2,500 kcal');
    await expect(programStartRow.getByRole('cell').nth(10)).toContainText(
      'Expenditure starting estimate',
    );
    await expect(page.getByText(/has no accepted check-in ID or fingerprint/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
      ),
    ).toBe(true);
    assertDiagnostics();
  });

  test('renders historical configuration and date evidence from the end query', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page);
    await page.setViewportSize({ height: 900, width: 768 });
    const historicalEnd = datePlus(fixtureDate, -1);
    await openAnalytics(page, 'analytics-goal-loss', historicalEnd);

    await expect(page.getByText('Historical view')).toBeVisible();
    await expect(page.getByText('America/Detroit')).toBeVisible();
    await expect(
      page.getByText(
        `${displayDate(datePlus(historicalEnd, -29))}–${displayDate(historicalEnd)} · daily`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
      ),
    ).toBe(true);
    assertDiagnostics();
  });

  test('announces loading and recovers from an expected read-only analytics error', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page, { allowExpectedAnalytics503: true });
    await authenticate(page, 'analytics-goal-loss');
    let releaseLoading: (() => void) | undefined;
    const loadingGate = new Promise<void>((resolve) => {
      releaseLoading = resolve;
    });
    let allowSuccess = false;
    let loadingReleased = false;
    await page.route('**/api/v1/adaptive-nutrition/analytics?**', async (route) => {
      if (!allowSuccess) {
        if (!loadingReleased) {
          await loadingGate;
          loadingReleased = true;
        }
        await route.fulfill({
          contentType: 'application/json',
          status: 503,
          body: JSON.stringify({
            error: { code: 'TEST_READ_FAILURE', message: 'Expected test error' },
          }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto('/nutrition/energy-balance', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('status', { name: 'Loading energy balance analytics' }),
    ).toBeVisible();
    releaseLoading?.();
    await expect(page.getByRole('alert')).toContainText('Energy balance could not be loaded', {
      timeout: 20_000,
    });
    allowSuccess = true;

    const success = page.waitForResponse(
      (value) => value.url().includes('/adaptive-nutrition/analytics?') && value.status() === 200,
    );
    await page.getByRole('button', { name: 'Retry analytics' }).click();
    await success;
    await expect(page.getByRole('heading', { name: 'Expenditure history' })).toBeVisible();
    assertDiagnostics();
  });

  test('keeps cutoff nutrition visible with 44px mobile controls and no overflow', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page);
    await page.setViewportSize({ height: 844, width: 320 });
    await openAnalytics(page, 'learning');
    for (const [width, rangeName, rangeQuery] of [
      [320, '3M', 'range=3m'],
      [390, '6M', 'range=6m'],
      [430, '1Y', 'range=1y'],
    ] as const) {
      await page.setViewportSize({ height: 844, width });
      await expect(page.getByText('Learning', { exact: true })).toBeVisible();
      await expect(
        page.getByText(/Today’s complete nutrition is logged and visible/),
      ).toBeVisible();
      await expect(page.getByText(/never plotted as zero/)).toBeVisible();
      const mobileLayout = await page.evaluate(() => ({
        noOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
        ranges: [
          ...document.querySelectorAll<HTMLElement>('[aria-label="Energy balance range"] button'),
        ].map((button) => ({
          height: button.getBoundingClientRect().height,
          width: button.getBoundingClientRect().width,
        })),
      }));
      expect(mobileLayout.noOverflow, `${width}px overflow`).toBe(true);
      expect(mobileLayout.ranges, `${width}px range controls`).toHaveLength(6);
      expect(
        mobileLayout.ranges.every((bounds) => bounds.height >= 44 && bounds.width >= 44),
        `${width}px touch targets`,
      ).toBe(true);
      const rangeButton = page.getByRole('button', { name: rangeName });
      await rangeButton.focus();
      const response = page.waitForResponse(
        (value) => value.url().includes(rangeQuery) && value.status() === 200,
      );
      await page.keyboard.press('Enter');
      await response;
      await expect(rangeButton).toBeFocused();
      await expect(rangeButton).toHaveAttribute('aria-pressed', 'true');
    }

    const dailyRange = page.getByRole('button', { name: '1W' });
    const dailyRangeResponse = page.waitForResponse(
      (value) => value.url().includes('range=1w') && value.status() === 200,
    );
    await dailyRange.click();
    await dailyRangeResponse;

    const tableDisclosure = page.getByText('View accessible data table');
    await tableDisclosure.focus();
    await page.keyboard.press('Enter');
    const dataTable = page.getByRole('table', { name: /Energy balance values/ });
    await expect(dataTable).toBeVisible();
    const missingRow = dataTable
      .getByRole('row')
      .filter({ hasText: displayDate(datePlus(fixtureDate, -3)) });
    await expect(missingRow.getByRole('cell').nth(1)).toHaveText('missing');
    await expect(missingRow.getByRole('cell').nth(3)).toHaveText('Not enough data');
    const cutoffRow = dataTable
      .getByRole('row')
      .filter({ hasText: displayDate(datePlus(fixtureDate, 1)) });
    await expect(cutoffRow.getByRole('cell').nth(1)).toHaveText('excluded');
    await expect(cutoffRow.getByRole('cell').nth(2)).toHaveText('2,400 kcal');
    await expect(cutoffRow.getByRole('cell').nth(3)).toHaveText('Not enough data');
    await expect(cutoffRow.getByRole('cell').nth(9)).toContainText(
      'COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF',
    );

    assertDiagnostics();
  });

  test('shows holding periods without changing the accepted expenditure', async ({ page }) => {
    const assertDiagnostics = monitorPage(page);
    await page.setViewportSize({ height: 844, width: 320 });
    await openAnalytics(page, 'holding');
    await expect(page.getByText('Holding', { exact: true })).toBeVisible();
    await expect(page.getByText(/preserving the last accepted estimate/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
      ),
    ).toBe(true);
    assertDiagnostics();
  });

  test('shows pending recommendations as review-needed without changing expenditure', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page);
    await openAnalytics(page, 'analytics-pending');

    await expect(page.getByText('Review needed', { exact: true })).toBeVisible();
    await expect(page.getByText(/has not changed expenditure or targets/)).toBeVisible();
    await expect(page.getByText('Fine dots · review needed')).toBeVisible();
    assertDiagnostics();
  });

  test('shows partial nutrition as excluded evidence and restores the fixture', async ({
    page,
  }) => {
    const token = tokens.get('analytics-goal-loss');
    if (!token) throw new Error('Missing analytics-goal-loss token');
    const date = datePlus(fixtureDate, -2);
    const headers = { authorization: `Bearer ${token}` };
    const partial = await apiContext.patch(`/api/v1/nutrition/${date}/status`, {
      data: { status: 'partial' },
      headers,
    });
    expect(partial.ok()).toBeTruthy();
    try {
      const assertDiagnostics = monitorPage(page);
      await openAnalytics(page, 'analytics-goal-loss');
      await page.getByText('View accessible data table').click();
      const row = page.getByRole('row').filter({ hasText: displayDate(date) });
      await expect(row.getByText('partial', { exact: true })).toBeVisible();
      await expect(row.getByText('Not enough data', { exact: true })).toBeVisible();
      assertDiagnostics();
    } finally {
      const restored = await apiContext.patch(`/api/v1/nutrition/${date}/status`, {
        data: { status: 'complete' },
        headers,
      });
      expect(restored.ok()).toBeTruthy();
    }
  });
});
