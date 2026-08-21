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
      isHistorical: boolean;
      strategyAsOfDate: string;
      goal: { status: string; endedLocalDate: string | null };
      activeRevision: { sequence: number };
      actualRate: {
        lookbackDays: number;
        status: string;
        confidence: string;
        observedWeightCount: number;
        spanDays: number;
      };
      forecast: { status: string; unavailableReason?: string | null } | null;
      summary: {
        kind: string;
        paceState?: string;
        rangeStatus?: string;
        originalPlannedChangeKg?: number;
        revisionAdjustmentKg?: number;
      };
      weeklyContributions: Array<{ direction: string }>;
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
    const allResponse = page.waitForResponse(
      (response) => response.url().includes('range=all') && response.status() === 200,
    );
    await page.keyboard.press('Enter');
    await allResponse;
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await expect(all).toBeFocused();

    const lookback = page.getByLabel('Recent pace lookback');
    await lookback.focus();
    const lookbackResponse = page.waitForResponse(
      (response) => response.url().includes('lookbackDays=14') && response.status() === 200,
    );
    await lookback.selectOption('14');
    await lookbackResponse;
    await expect(lookback).toHaveValue('14');
    await expect(page.getByText('Recent pace · 14 days')).toBeVisible();

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
    const lastExactDate = exactTable.locator('tbody tr').last().getByRole('button');
    await lastExactDate.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-slot="goal-trajectory-point-detail"]')).toContainText(
      /Estimated trend/u,
    );
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
    await expect(page.getByText(/Target or rate revised/u).first()).toBeVisible();
    await expect(page.getByText(/Structured evidence using revision/u)).toBeVisible();
    await expect(page.getByText('Goal revision adjustment')).toBeVisible();
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
      unavailableReason: 'LIMITED_TREND_CONFIDENCE',
    });
    await expect(page.getByText('No reliable estimate yet')).toBeVisible();
    await expect(page.getByText(/evidence is still limited/u)).toBeVisible();
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
});
