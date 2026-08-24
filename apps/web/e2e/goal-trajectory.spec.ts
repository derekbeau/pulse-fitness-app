import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'America/Detroit' });

const password = 'adaptive-preview-only';
type Fixture =
  | 'trajectory-loss'
  | 'trajectory-maintenance'
  | 'trajectory-edited'
  | 'trajectory-reached'
  | 'trajectory-gain'
  | 'trajectory-sparse'
  | 'trajectory-maintenance-below'
  | 'trajectory-maintenance-above'
  | 'trajectory-scale-only'
  | 'trajectory-historical';

let api: APIRequestContext;
const tokens = new Map<Fixture, string>();

const uiDate = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));

const uiAxisDate = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));

function username(fixture: Fixture) {
  const suffix: Record<Fixture, string> = {
    'trajectory-loss': 'gt-loss',
    'trajectory-maintenance': 'gt-maintain',
    'trajectory-edited': 'gt-edited',
    'trajectory-reached': 'gt-reached',
    'trajectory-gain': 'gt-gain',
    'trajectory-sparse': 'gt-sparse',
    'trajectory-maintenance-below': 'gt-below',
    'trajectory-maintenance-above': 'gt-above',
    'trajectory-scale-only': 'gt-scale',
    'trajectory-historical': 'gt-historical',
  };
  return `adaptive-preview-${suffix[fixture]}`;
}

function monitorPage(page: Page) {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      failures.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (failed) =>
    failures.push(
      `requestfailed: ${failed.method()} ${failed.url()} ${failed.failure()?.errorText ?? ''}`,
    ),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`http ${response.status()}: ${response.url()}`);
  });
  return () => expect(failures, 'browser diagnostics').toEqual([]);
}

async function openTrajectory(
  page: Page,
  fixture: Fixture,
  options: { historical?: boolean } = {},
) {
  const token = tokens.get(fixture);
  if (!token) throw new Error(`Missing ${fixture} token`);
  let goalId: string;
  if (options.historical) {
    const historyResponse = await api.get('/api/v1/adaptive-nutrition/goals?page=1&limit=20', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(historyResponse.ok(), `${fixture} goal history`).toBeTruthy();
    const historyPayload = (await historyResponse.json()) as {
      data: Array<{ goal: { id: string; status: string } }>;
    };
    const historicalGoal = historyPayload.data.find(({ goal }) => goal.status !== 'active');
    expect(historicalGoal, `${fixture} closed goal`).toBeDefined();
    goalId = historicalGoal?.goal.id ?? '';
  } else {
    const goalResponse = await api.get('/api/v1/adaptive-nutrition/goals/current', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(goalResponse.ok(), `${fixture} current goal`).toBeTruthy();
    const goalPayload = (await goalResponse.json()) as { data: { goal: { id: string } } };
    goalId = goalPayload.data.goal.id;
  }
  await setAuthenticatedSession(page, token);
  if (options.historical) {
    await page.goto('/nutrition?view=coach', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: 'Nutrition' })).toBeVisible();
  }
  const trajectoryResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/adaptive-nutrition/goals/${goalId}/trajectory?`) &&
      response.status() === 200,
  );
  if (options.historical) {
    const historyLink = page.locator(`a[href="/nutrition/goals/${goalId}"]`);
    await expect(historyLink).toHaveAccessibleName('View trajectory');
    await historyLink.focus();
    await page.keyboard.press('Enter');
  } else {
    await page.goto(`/nutrition/goals/${goalId}`, { waitUntil: 'networkidle' });
  }
  const response = await trajectoryResponse;
  const payload = (await response.json()) as {
    data: {
      trendSource: string;
      strategyTrendSource: string;
      productTrend: { currentTrendWeightKg: number | null; currentTrendDate: string | null };
      isHistorical: boolean;
      strategyAsOfDate: string;
      range: { startDate: string; endDate: string };
      goal: { status: string; endedLocalDate: string | null };
      activeRevision: { sequence: number };
      actualRate: {
        lookbackDays: number;
        kgPerWeek: number | null;
        status: string;
        confidence: string;
        unavailableReason: string | null;
        observedWeightCount: number;
        spanDays: number;
      };
      forecast: {
        status: string;
        unavailableReason?: string | null;
        projectedEndDate?: string | null;
        points?: Array<{ date: string }>;
      } | null;
      summary: {
        kind: string;
        currentTrendWeightKg?: number | null;
        paceState?: string;
        rangeStatus?: string;
        originalPlannedChangeKg?: number;
        revisionAdjustmentKg?: number;
      };
      weeklyContributions: Array<{ direction: string }>;
      trendPoints: Array<{
        date: string;
        trendWeightKg: number | null;
        targetWeightKg: number | null;
        evidenceState: string;
      }>;
      annotations: Array<{ date: string; kind: string; label: string }>;
      completionReview: {
        trendTargetStatus: string;
        scaleTargetStatus: string;
        completionReviewRequired: boolean;
      };
    };
  };
  await expect(page.getByRole('heading', { level: 1, name: 'Goal trajectory' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  return { goalId, analytics: payload.data };
}

async function assertNoOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    `${width}px page overflow`,
  ).toBe(true);
  for (const control of await page.getByRole('button', { name: /^(1M|3M|6M|1Y|All)$/ }).all()) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0, `${width}px range touch target`).toBeGreaterThanOrEqual(44);
  }
}

test.describe.serial('Goal trajectory', () => {
  test.beforeAll(async () => {
    api = await request.newContext({ baseURL: apiBaseURL });
    for (const fixture of [
      'trajectory-loss',
      'trajectory-maintenance',
      'trajectory-edited',
      'trajectory-reached',
      'trajectory-gain',
      'trajectory-sparse',
      'trajectory-maintenance-below',
      'trajectory-maintenance-above',
      'trajectory-scale-only',
      'trajectory-historical',
    ] as const) {
      const login = await api.post('/api/v1/auth/login', {
        data: { username: username(fixture), password },
      });
      expect(login.ok(), `${fixture} login`).toBeTruthy();
      tokens.set(fixture, ((await login.json()) as { data: { token: string } }).data.token);
    }
  });

  test.afterAll(async () => api.dispose());

  test('renders loss pace, forecast, weekly evidence, keyboard range, and exact values', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ width: 390, height: 1000 });
    const { analytics } = await openTrajectory(page, 'trajectory-loss');
    await expect(page.getByRole('heading', { name: /Lose to/u })).toBeVisible();
    expect(analytics.trendSource).toBe('product_trend_weight_v1');
    expect(analytics.strategyTrendSource).toBe('adaptive_model_trend');
    expect(
      Math.abs(
        (analytics.productTrend.currentTrendWeightKg ?? 0) -
          (analytics.summary.currentTrendWeightKg ?? 0),
      ),
    ).toBeGreaterThan(0.01);
    await expect(page.getByText('Product Trend Weight').first()).toBeVisible();
    await expect(page.getByText('Adaptive strategy trend').first()).toBeVisible();
    await expect(page.getByText('Stored Adaptive start')).toBeVisible();
    await expect(page.getByText('Selected pace')).toBeVisible();
    await expect(page.getByText('Original goal distance')).toBeVisible();
    await expect(page.getByText('Current planned distance')).toBeVisible();
    await expect(page.getByText('ETA change since latest revision')).toBeVisible();
    await expect(page.getByText('Rate confidence')).toBeVisible();
    await expect(
      page.getByText(`Recent pace · ${analytics.actualRate.lookbackDays} days`),
    ).toBeVisible();
    await expect(
      page.getByText(/will not increase a deficit or surplus to catch up/u),
    ).toBeVisible();
    if (analytics.weeklyContributions.some((week) => week.direction === 'insufficient_evidence')) {
      await expect(
        page.getByText(/missing evidence is not treated as zero/u).first(),
      ).toBeVisible();
    }

    const all = page.getByRole('button', { name: 'All' });
    await all.focus();
    const allResponsePromise = page.waitForResponse(
      (response) => response.url().includes('range=all') && response.status() === 200,
    );
    await page.keyboard.press('Enter');
    const allResponse = await allResponsePromise;
    const allAnalytics = (await allResponse.json()) as { data: typeof analytics };
    expect(allAnalytics.data.productTrend).toEqual(analytics.productTrend);
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await expect(all).toBeFocused();

    const goalStart = page.getByRole('button', { name: /Goal started/u }).first();
    await goalStart.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-slot="goal-trajectory-point-detail"]')).toContainText(
      /goal started/u,
    );

    const exactSummary = page.getByText('Exact trajectory values');
    await exactSummary.focus();
    await page.keyboard.press('Enter');
    const exactTable = page.getByRole('table', { name: /Exact values for the goal trajectory/u });
    await expect(exactTable).toBeVisible();
    await expect(
      exactTable.getByRole('columnheader', { name: 'Product Trend Weight' }),
    ).toBeVisible();
    await expect(
      exactTable.getByRole('columnheader', { name: 'Adaptive strategy trend' }),
    ).toBeVisible();
    const forecastDate = allAnalytics.data.forecast?.points?.at(-1)?.date;
    expect(forecastDate, 'available loss forecast point').toBeTruthy();
    const forecastExactDate = exactTable.getByRole('button', {
      name: uiDate(forecastDate ?? ''),
    });
    await forecastExactDate.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-slot="goal-trajectory-point-detail"]')).toContainText(
      /Estimated trend/u,
    );

    const lookback = page.getByLabel('Recent pace lookback');
    await lookback.focus();
    const lookbackResponse = page.waitForResponse(
      (response) => response.url().includes('lookbackDays=14') && response.status() === 200,
    );
    await lookback.selectOption('14');
    await lookbackResponse;
    await expect(lookback).toHaveValue('14');
    await expect(page.getByText('Recent pace · 14 days')).toBeVisible();
    await assertNoOverflow(page, 390);
    if (process.env.CAPTURE_ISSUE_109_SCREENSHOTS === '1') {
      await page.screenshot({ fullPage: true, path: 'artifacts/issue-109-loss-390.png' });
      await assertNoOverflow(page, 1280);
      await page.screenshot({ fullPage: true, path: 'artifacts/issue-109-loss-1280.png' });
    }
    diagnostics();
  });

  test('renders maintenance with a named band, denominator, and no automatic correction', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ width: 320, height: 1000 });
    const { analytics } = await openTrajectory(page, 'trajectory-maintenance');
    expect(analytics.summary).toMatchObject({
      kind: 'maintenance',
      rangeStatus: 'within',
      timeInRange: {
        modeledDays: 21,
        daysWithinRange: 21,
        timeInRangeFraction: 1,
        evidenceStatus: 'supported',
      },
    });
    await expect(page.getByRole('heading', { name: /Maintain around/u })).toBeVisible();
    await expect(page.getByText('Maintenance band')).toBeVisible();
    await expect(page.getByText('Time in range')).toBeVisible();
    await expect(page.getByText('21 of 21 modeled days · 100%')).toBeVisible();
    await expect(page.getByText(/No plan change is being proposed/u)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Forecast explanation' })).toHaveCount(0);
    await assertNoOverflow(page, 320);
    if (process.env.CAPTURE_ISSUE_109_SCREENSHOTS === '1') {
      await page.screenshot({ fullPage: true, path: 'artifacts/issue-109-maintenance-320.png' });
    }
    diagnostics();
  });

  test('keeps target and rate revisions visible without moving the original start', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ width: 430, height: 1000 });
    const { analytics } = await openTrajectory(page, 'trajectory-edited');
    expect(analytics.activeRevision.sequence).toBeGreaterThan(1);
    expect(analytics.summary.revisionAdjustmentKg).not.toBe(0);
    await expect(
      page.getByText(`Revision ${analytics.activeRevision.sequence}`, { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(/Goal target.*revised/u).first()).toBeVisible();
    await expect(page.getByText(/Structured evidence using revision/u)).toBeVisible();
    await expect(page.getByText('Goal revision adjustment')).toBeVisible();
    const strategyPoint = analytics.trendPoints.find(
      (point) => point.evidenceState === 'strategy_event',
    );
    expect(strategyPoint, 'off-measurement strategy revision point').toBeDefined();
    expect(strategyPoint?.trendWeightKg).toBeNull();
    expect(strategyPoint?.targetWeightKg).not.toBeNull();
    const revisionAnnotationIndex = analytics.annotations.findIndex(
      (annotation) =>
        annotation.date === strategyPoint?.date && annotation.kind.includes('revised'),
    );
    expect(revisionAnnotationIndex).toBeGreaterThanOrEqual(0);
    const revisionX = Number(
      await page
        .locator('.goal-trajectory-annotation-line line, line.goal-trajectory-annotation-line')
        .nth(revisionAnnotationIndex)
        .getAttribute('x1'),
    );
    const targetTransitionXs = await page
      .locator('.goal-trajectory-target-line path, path.goal-trajectory-target-line')
      .evaluate((path) => {
        const values = (path.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/gu) ?? []).map(Number);
        const points = Array.from({ length: Math.floor(values.length / 2) }, (_, index) => ({
          x: values[index * 2],
          y: values[index * 2 + 1],
        }));
        return points.flatMap((point, index) => {
          const next = points[index + 1];
          return next && Math.abs(point.x - next.x) <= 0.5 && Math.abs(point.y - next.y) > 0.5
            ? [point.x]
            : [];
        });
      });
    expect(
      targetTransitionXs.some((coordinate) => Math.abs(coordinate - revisionX) <= 1),
      `target transition ${targetTransitionXs.join(', ')} aligns to revision ${revisionX}`,
    ).toBe(true);
    await page.getByText('Exact trajectory values').press('Enter');
    const strategyRow = page
      .getByRole('button', { name: uiDate(strategyPoint?.date ?? ''), exact: true })
      .locator('xpath=ancestor::tr');
    await expect(strategyRow.getByRole('cell').nth(1)).toHaveText('—');
    await expect(strategyRow).toContainText('Strategy event · no Product Trend Weight observation');
    await assertNoOverflow(page, 430);
    if (process.env.CAPTURE_ISSUE_109_SCREENSHOTS === '1') {
      await page.screenshot({ fullPage: true, path: 'artifacts/issue-109-revision-430.png' });
    }
    diagnostics();
  });

  test('renders gain direction from the same server trajectory contract', async ({ page }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ width: 768, height: 1000 });
    const { analytics } = await openTrajectory(page, 'trajectory-gain');
    expect(analytics.summary.kind).toBe('weight_change');
    expect(analytics.summary.paceState).toBe('faster_than_selected');
    expect(analytics.actualRate.kgPerWeek).toBeGreaterThan(0);
    expect(analytics.forecast).toMatchObject({ status: 'available', unavailableReason: null });
    expect(analytics.forecast?.projectedCenterDate).not.toBeNull();
    await expect(page.getByRole('heading', { name: /Gain to/u })).toBeVisible();
    await expect(page.getByText('Selected pace')).toBeVisible();
    await expect(page.getByText('Faster than selected')).toBeVisible();
    await expect(page.getByText(/Your recent trend averaged/u)).toBeVisible();
    await assertNoOverflow(page, 768);
    diagnostics();
  });

  test('keeps trend and scale completion evidence distinct', async ({ page }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    const { analytics } = await openTrajectory(page, 'trajectory-reached');
    expect(analytics.completionReview).toMatchObject({
      trendTargetStatus: 'reached',
      scaleTargetStatus: 'not_reached',
      completionReviewRequired: true,
    });
    await expect(page.getByText(/Adaptive model trend is in the completion range/u)).toBeVisible();
    await expect(page.getByText(/Current scale evidence/u)).toBeVisible();
    await expect(
      page.getByText(/supported Adaptive model trend is inside the target tolerance/u),
    ).toBeVisible();
    await expect(page.getByText(/not have enough supported trend history/u)).toHaveCount(0);
    await assertNoOverflow(page, 1280);
    diagnostics();
  });

  test('keeps sparse evidence honest without an ETA', async ({ page }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ width: 430, height: 1000 });
    const { analytics } = await openTrajectory(page, 'trajectory-sparse');
    expect(analytics.actualRate.confidence).toBe('insufficient');
    expect(analytics.forecast).toMatchObject({
      status: 'unavailable',
      unavailableReason: analytics.actualRate.unavailableReason,
    });
    await expect(page.getByText('No reliable estimate yet')).toBeVisible();
    await expect(page.getByText(/not have enough supported trend history/u)).toBeVisible();
    await assertNoOverflow(page, 430);
    diagnostics();
  });

  for (const [fixture, expected] of [
    ['trajectory-maintenance-below', 'below'],
    ['trajectory-maintenance-above', 'above'],
  ] as const) {
    test(`renders maintenance ${expected} the band without auto-correction`, async ({ page }) => {
      const diagnostics = monitorPage(page);
      const { analytics } = await openTrajectory(page, fixture);
      expect(analytics.summary).toMatchObject({ kind: 'maintenance', rangeStatus: expected });
      await expect(
        page.getByText(expected === 'below' ? 'Below range' : 'Above range'),
      ).toBeVisible();
      await expect(page.getByText(/No plan change is being proposed/u)).toBeVisible();
      diagnostics();
    });
  }

  test('keeps a raw scale-only target crossing out of completion review', async ({ page }) => {
    const diagnostics = monitorPage(page);
    const { analytics } = await openTrajectory(page, 'trajectory-scale-only');
    expect(analytics.completionReview).toMatchObject({
      trendTargetStatus: 'not_reached',
      scaleTargetStatus: 'reached',
      completionReviewRequired: false,
    });
    await expect(page.getByText(/latest scale value from .* crossed the target/u)).toBeVisible();
    await expect(page.getByText(/wait for the trend/u)).toBeVisible();
    diagnostics();
  });

  test('renders a closed historical goal as an immutable record', async ({ page }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ width: 768, height: 1000 });
    const { analytics } = await openTrajectory(page, 'trajectory-historical', {
      historical: true,
    });
    expect(analytics.isHistorical).toBe(true);
    expect(analytics.goal.status).not.toBe('active');
    expect(analytics.goal.endedLocalDate).toBe(analytics.strategyAsOfDate);
    expect(analytics.forecast).toBeNull();
    await expect(page.getByText(/^Goal closed /u)).toBeVisible();
    await expect(page.getByText('Calorie target at goal end')).toBeVisible();
    await expect(page.getByText('Adaptive expenditure at goal end')).toBeVisible();
    await expect(page.getByText(/historical record cannot change your plan/u)).toBeVisible();
    await expect(page.getByText(/Latest scale evidence in this goal/u)).toBeVisible();
    await expect(page.getByText('No reliable estimate yet')).toHaveCount(0);
    await expect(page.getByText(/Your next check-in reviews/u)).toHaveCount(0);
    await assertNoOverflow(page, 768);
    if (process.env.CAPTURE_ISSUE_109_SCREENSHOTS === '1') {
      await page.screenshot({ fullPage: true, path: 'artifacts/issue-109-historical-768.png' });
    }
    diagnostics();
  });

  test('keeps the trajectory readable in light, dark, and midnight themes', async ({ page }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ width: 390, height: 1000 });
    const { goalId } = await openTrajectory(page, 'trajectory-loss');

    for (const theme of ['light', 'dark', 'midnight'] as const) {
      await page.evaluate((value) => window.localStorage.setItem('pulse-theme', value), theme);
      const trajectoryResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/v1/adaptive-nutrition/goals/${goalId}/trajectory?`) &&
          response.status() === 200,
      );
      await page.reload({ waitUntil: 'networkidle' });
      await trajectoryResponse;

      const rootClasses = (await page.locator('html').getAttribute('class'))?.split(/\s+/u) ?? [];
      expect(rootClasses.includes('dark'), `${theme} dark class`).toBe(theme === 'dark');
      expect(rootClasses.includes('theme-midnight'), `${theme} midnight class`).toBe(
        theme === 'midnight',
      );
      await expect(page.getByRole('heading', { level: 2, name: 'Goal trajectory' })).toBeVisible();
      await expect(page.getByLabel('Trajectory legend')).toContainText('Product Trend Weight');
      await assertNoOverflow(page, 390);

      if (
        process.env.CAPTURE_ISSUE_109_SCREENSHOTS === '1' &&
        (theme === 'light' || theme === 'midnight')
      ) {
        await page.screenshot({
          fullPage: true,
          path: `artifacts/issue-109-theme-${theme}-390.png`,
        });
      }
    }

    await page.waitForLoadState('networkidle');
    diagnostics();
  });

  for (const [zone, width] of [
    ['Pacific/Kiritimati', 390],
    ['Etc/GMT+12', 320],
  ] as const) {
    test.describe(`literal goal dates in ${zone}`, () => {
      test.use({ timezoneId: zone });

      test('keeps Product points, markers, ticks, and exact rows on server date keys', async ({
        page,
      }) => {
        const diagnostics = monitorPage(page);
        await page.setViewportSize({ width, height: 1000 });
        const { analytics } = await openTrajectory(page, 'trajectory-loss');
        const firstPoint = analytics.trendPoints[0];
        const firstAnnotation = analytics.annotations[0];
        expect(firstPoint).toBeDefined();
        expect(firstAnnotation).toBeDefined();
        if (!firstPoint || !firstAnnotation) throw new Error('Expected trajectory evidence');

        const ticks = page.locator(
          '.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value',
        );
        await expect(ticks.first()).toHaveText(uiAxisDate(analytics.range.startDate));
        await expect(ticks.last()).toHaveText(
          uiAxisDate(analytics.forecast?.projectedEndDate ?? analytics.range.endDate),
        );
        await expect(
          page.getByRole('button', {
            name: new RegExp(`${uiDate(firstAnnotation.date)}.*${firstAnnotation.label}`, 'u'),
          }),
        ).toBeVisible();

        const exactSummary = page.getByText('Exact trajectory values');
        await exactSummary.press('Enter');
        const table = page.getByRole('table', { name: /Exact values for the goal trajectory/u });
        await expect(
          table.getByRole('button', { name: uiDate(firstPoint.date), exact: true }),
        ).toBeVisible();
        await assertNoOverflow(page, width);
        await page.waitForLoadState('networkidle');
        diagnostics();
      });
    });
  }
});
