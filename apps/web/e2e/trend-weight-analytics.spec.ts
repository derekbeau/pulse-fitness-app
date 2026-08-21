import type { TrendWeightAnalytics } from '@pulse/shared';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { setAuthenticatedSession } from './auth-session';
import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'America/Detroit' });

const password = 'trend-weight-preview-only';

const dateKeyInTimeZone = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const dateKeyInDetroit = () => dateKeyInTimeZone('America/Detroit');

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const uiDate = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00.000Z`));
const uiAxisDate = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
const uiWeight = (value: number) => `${Number(value.toFixed(1))} lbs`;
const uiSignedWeight = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${uiWeight(Math.abs(value))}`;
const uiUpdatedAt = (timestamp: number) =>
  `Updated ${new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Detroit',
    timeZoneName: 'short',
  }).format(timestamp)}`;

async function captureIssueScreenshot(page: Page, filename: string) {
  if (process.env.CAPTURE_ISSUE_108_SCREENSHOTS !== '1') return;
  const directory = resolve(process.cwd(), '../../artifacts/issue-108');
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: resolve(directory, filename) });
}

function monitorPage(page: Page) {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      failures.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (failed) => {
    failures.push(
      `requestfailed: ${failed.method()} ${failed.url()} ${failed.failure()?.errorText}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failures.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  return () => expect(failures, 'browser diagnostics').toEqual([]);
}

async function createTrendUser(api: APIRequestContext, endDate: string, count: number) {
  const username = `trend-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  const register = await api.post('/api/v1/auth/register', {
    data: { password, username },
  });
  expect(register.ok(), await register.text()).toBeTruthy();
  const token = ((await register.json()) as { data: { token: string } }).data.token;
  const authorization = `Bearer ${token}`;
  for (let index = 0; index < count; index += 1) {
    const date = addDays(endDate, -(count - 1 - index));
    const weight = index === count - 1 ? 190 : 180 - index * 0.08;
    const response = await api.post('/api/v1/weight', {
      data: { date, unit: 'lbs', weight },
      headers: { authorization },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  return { authorization, token };
}

async function configureGoal(
  api: APIRequestContext,
  authorization: string,
  type: 'lose' | 'maintain' | 'gain',
  timeZone = 'America/Detroit',
  options: { supersedePending?: boolean; targetWeightKg?: number | null } = {},
) {
  const response = await api.put('/api/v1/adaptive-nutrition/program', {
    data: {
      status: 'active',
      timeZone,
      heightCm: null,
      birthDate: null,
      rmrEquation: 'manual_tdee',
      activityLevel: null,
      manualBaselineTdeeKcal: 2500,
      goalType: type,
      targetWeightKg:
        options.targetWeightKg ?? (type === 'lose' ? 75 : type === 'gain' ? 90 : null),
      goalRatePctPerWeek: type === 'lose' ? -0.5 : type === 'gain' ? 0.25 : 0,
      proteinGrams: 180,
      fatAllocationPct: 30,
      userCalorieFloorKcal: 1500,
      rebaseline: false,
      supersedePending: options.supersedePending ?? false,
    },
    headers: { authorization },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function reviseGoal(api: APIRequestContext, authorization: string) {
  const currentResponse = await api.get('/api/v1/adaptive-nutrition/goals/current', {
    headers: { authorization },
  });
  expect(currentResponse.ok(), await currentResponse.text()).toBeTruthy();
  const current = (await currentResponse.json()) as { data: { goal: { id: string } } };
  const response = await api.patch(`/api/v1/adaptive-nutrition/goals/${current.data.goal.id}`, {
    data: {
      type: 'lose',
      targetWeightKg: 74,
      maintenanceCenterKg: null,
      goalRatePctPerWeek: -0.4,
      supersedePendingRecommendation: true,
    },
    headers: { authorization },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function chartDotX(dot: ReturnType<Page['locator']>) {
  const path = dot.locator('path');
  const coordinate = await path.getAttribute('cx');
  if (coordinate !== null) return Number(coordinate);
  const transform = await path.getAttribute('transform');
  const match = transform?.match(/^translate\(([-\d.]+)/);
  if (!match) throw new Error('Trend Weight point did not expose an x coordinate');
  return Number(match[1]);
}

async function trendWeightAxisLabels(page: Page) {
  return page
    .locator('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')
    .allTextContents();
}

async function expectLiteralAxisRange(page: Page, range: TrendWeightAnalytics['range']) {
  await expect
    .poll(async () => trendWeightAxisLabels(page))
    .toEqual(expect.arrayContaining([uiAxisDate(range.startDate), uiAxisDate(range.endDate)]));
  const labels = await trendWeightAxisLabels(page);
  expect(labels[0]).toBe(uiAxisDate(range.startDate));
  expect(labels.at(-1)).toBe(uiAxisDate(range.endDate));
}

test('shows server-owned Trend Weight, raw spike, exact table, ranges, and responsive layouts', async ({
  page,
}) => {
  const endDate = dateKeyInDetroit();
  const api = await request.newContext({ baseURL: apiBaseURL });
  const diagnostics = monitorPage(page);
  try {
    const user = await createTrendUser(api, endDate, 45);
    const analyticsResponse = await api.get(`/api/v1/weight/trend?range=1m&end=${endDate}`, {
      headers: { authorization: user.authorization },
    });
    expect(analyticsResponse.ok()).toBeTruthy();
    const analytics = (await analyticsResponse.json()) as {
      data: {
        current: {
          latestScale: { weight: number };
          ratePerWeek: number;
          scaleTrendDifference: number;
          trendDate: string;
          trendWeight: number;
          state: string;
        };
        deltas: Array<{
          requestedDays: 7 | 14 | 30 | 90;
          status: 'supported' | 'unavailable';
          value: number | null;
        }>;
        points: Array<{
          date: string;
          scaleWeight: number;
          state: string;
          trendWeight: number | null;
        }>;
      };
    };
    const snapshotResponse = await api.get(`/api/v1/dashboard/snapshot?date=${endDate}`, {
      headers: { authorization: user.authorization },
    });
    expect(snapshotResponse.ok()).toBeTruthy();
    const snapshot = (await snapshotResponse.json()) as {
      data: { weight: { trendValue: number } };
    };
    expect(snapshot.data.weight.trendValue).toBeCloseTo(analytics.data.current.trendWeight);
    const agentTokenResponse = await api.post('/api/v1/agent-tokens', {
      data: { name: 'Trend Weight parity' },
      headers: { authorization: user.authorization },
    });
    expect(agentTokenResponse.status()).toBe(201);
    const agentToken = (await agentTokenResponse.json()) as {
      data: { id: string; token: string };
    };
    const agentAnalyticsResponse = await api.get(`/api/v1/weight/trend?range=1m&end=${endDate}`, {
      headers: { authorization: `AgentToken ${agentToken.data.token}` },
    });
    expect(agentAnalyticsResponse.ok()).toBeTruthy();
    expect(await agentAnalyticsResponse.json()).toEqual(analytics);
    const deleteAgentToken = await api.delete(`/api/v1/agent-tokens/${agentToken.data.id}`, {
      headers: { authorization: user.authorization },
    });
    expect(deleteAgentToken.ok()).toBeTruthy();

    await setAuthenticatedSession(page, user.token);
    const response = page.waitForResponse((value) => {
      const url = new URL(value.url());
      return url.pathname === '/api/v1/weight/trend' && url.searchParams.get('range') === '1m';
    });
    await page.goto('/weight', { waitUntil: 'networkidle' });
    await response;
    await expect(page.getByRole('heading', { level: 1, name: 'Trend Weight' })).toBeVisible();
    await expect(page.getByText('Trend established')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Trend Weight chart' })).toBeVisible();
    await expect(page.getByText('Scale Weight dots')).toBeVisible();
    await expect(page.getByText('Trend Weight line')).toBeVisible();
    await expect(
      page.getByText('No active goal comparison. Trend Weight is still useful for direction.'),
    ).toBeVisible();
    const latestScaleLabel = `${Number(analytics.data.current.latestScale.weight.toFixed(1))} lbs`;
    await expect(page.locator('[data-slot="trend-weight-latest-scale"]')).toHaveText(
      latestScaleLabel,
    );
    expect(analytics.data.current.trendWeight).toBeLessThan(185);
    await expect(
      page.getByRole('heading', { name: uiWeight(analytics.data.current.trendWeight) }),
    ).toBeVisible();
    await expect(
      page.getByText(`Effective ${uiDate(analytics.data.current.trendDate)}`),
    ).toBeVisible();
    await expect(
      page.getByText(`${uiSignedWeight(analytics.data.current.ratePerWeek)}/week`, { exact: true }),
    ).toBeVisible();
    const summary = page.getByRole('article', {
      name: uiWeight(analytics.data.current.trendWeight),
    });
    await expect(
      summary.getByText(uiSignedWeight(analytics.data.current.scaleTrendDifference), {
        exact: true,
      }),
    ).toBeVisible();
    const deltaRegion = page.getByRole('region', { name: 'Change by interval' });
    for (const delta of analytics.data.deltas.filter(
      (value): value is typeof value & { value: number } =>
        value.status === 'supported' && value.value !== null,
    )) {
      const card = deltaRegion
        .getByText(`${delta.requestedDays} days`, { exact: true })
        .locator('..');
      await expect(card.getByText(uiSignedWeight(delta.value), { exact: true })).toBeVisible();
    }

    const pointDetail = page.locator('[data-slot="trend-weight-point-detail"]');
    await expect(pointDetail).toContainText('Scale 190 lbs');
    const firstPoint = analytics.data.points[0];
    const firstDot = page.locator('.recharts-scatter-symbol').first();
    await firstDot.hover();
    const tooltip = page.locator('[data-slot="trend-weight-tooltip"]');
    await expect(tooltip).toContainText(`Scale ${Number(firstPoint.scaleWeight.toFixed(1))} lbs`);
    await expect(tooltip).toContainText(
      firstPoint.trendWeight === null
        ? 'Trend Not available'
        : `Trend ${Number(firstPoint.trendWeight.toFixed(1))} lbs`,
    );
    await expect(tooltip).toContainText(`State ${firstPoint.state.replace('_', ' ')}`);
    await firstDot.click();
    await expect(pointDetail).toContainText(
      `Scale ${Number(firstPoint.scaleWeight.toFixed(1))} lbs`,
    );
    await expect(pointDetail).toContainText(firstPoint.state.replace('_', ' '));

    await page.getByRole('button', { name: 'Show exact values' }).press('Enter');
    const table = page.getByRole('table', { name: 'Exact Scale and Trend Weight values' });
    await expect(table).toBeVisible();
    await expect(
      table.getByRole('button', { name: new RegExp(endDate.slice(0, 4)) }).last(),
    ).toBeVisible();
    await table.getByRole('button').last().press('Enter');
    await expect(pointDetail).toContainText('Scale');

    const allResponse = page.waitForResponse((value) =>
      value.url().includes('/api/v1/weight/trend?range=all'),
    );
    await page.getByRole('button', { name: 'All' }).press('Space');
    await allResponse;
    await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    for (const width of [320, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
        `${width}px page overflow`,
      ).toBe(true);
      for (const button of await page.getByRole('button', { name: /^(1M|3M|6M|1Y|All)$/ }).all()) {
        const box = await button.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      }
    }

    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByRole('heading', { level: 1, name: 'Trend Weight' }).scrollIntoViewIfNeeded();
    await captureIssueScreenshot(page, 'issue-108-trend-weight-390.png');
    await page.setViewportSize({ width: 1280, height: 900 });
    await captureIssueScreenshot(page, 'issue-108-trend-weight-1280.png');
    await page.setViewportSize({ width: 390, height: 900 });
    const latestEntry = page
      .getByRole('listitem')
      .filter({ has: page.getByText(uiDate(endDate), { exact: true }) });
    await expect(latestEntry).toContainText('190 lbs');
    await latestEntry.getByRole('button', { name: 'Edit' }).click();
    const updateResponse = page.waitForResponse(
      (value) => value.request().method() === 'PATCH' && value.url().includes('/api/v1/weight/'),
    );
    await page
      .getByRole('spinbutton', { name: new RegExp(`Weight value for ${uiDate(endDate)}`) })
      .fill('188');
    await latestEntry.getByRole('button', { name: 'Save' }).click();
    const updateHttpResponse = await updateResponse;
    expect(updateHttpResponse.ok()).toBeTruthy();
    const updatePayload = (await updateHttpResponse.json()) as { data: { updatedAt: number } };
    await expect(page.getByText('Weight entry updated')).toBeVisible();
    await expect(page.locator('[data-slot="trend-weight-latest-scale"]')).toHaveText('188 lbs');
    await expect(page.getByText(/Corrected weigh-in/).first()).toBeVisible();
    await expect(
      page.getByText(uiUpdatedAt(updatePayload.data.updatedAt), { exact: true }),
    ).toBeVisible();
    const correctedAnalyticsResponse = await api.get(
      `/api/v1/weight/trend?range=all&end=${endDate}`,
      { headers: { authorization: user.authorization } },
    );
    expect(correctedAnalyticsResponse.ok()).toBeTruthy();
    const correctedAnalytics = (await correctedAnalyticsResponse.json()) as {
      data: { current: { trendWeight: number } };
    };
    expect(correctedAnalytics.data.current.trendWeight).not.toBeCloseTo(
      analytics.data.current.trendWeight,
    );
    await expect(
      page.getByRole('heading', {
        name: uiWeight(correctedAnalytics.data.current.trendWeight),
      }),
    ).toBeVisible();
    const correctedSnapshotResponse = await api.get(`/api/v1/dashboard/snapshot?date=${endDate}`, {
      headers: { authorization: user.authorization },
    });
    const correctedSnapshot = (await correctedSnapshotResponse.json()) as {
      data: { weight: { trendValue: number } };
    };
    expect(correctedSnapshot.data.weight.trendValue).toBeCloseTo(
      correctedAnalytics.data.current.trendWeight,
    );

    const deleteResponse = page.waitForResponse(
      (value) => value.request().method() === 'DELETE' && value.url().includes('/api/v1/weight/'),
    );
    await page.getByRole('button', { name: `Delete weight entry from ${uiDate(endDate)}` }).click();
    await page.getByRole('button', { name: 'Delete entry' }).click();
    expect((await deleteResponse).ok()).toBeTruthy();
    await expect(page.getByText('Weight entry deleted')).toBeVisible();
    const reconciledResponse = await api.get(`/api/v1/weight/trend?range=all&end=${endDate}`, {
      headers: { authorization: user.authorization },
    });
    expect(reconciledResponse.ok()).toBeTruthy();
    const reconciled = (await reconciledResponse.json()) as {
      data: {
        current: { latestScale: { date: string; weight: number }; trendWeight: number };
      };
    };
    await expect(page.locator('[data-slot="trend-weight-latest-scale"]')).toHaveText(
      uiWeight(reconciled.data.current.latestScale.weight),
    );
    expect(reconciled.data.current.latestScale.date).toBe(addDays(endDate, -1));
    await expect(
      page.getByRole('heading', { name: uiWeight(reconciled.data.current.trendWeight) }),
    ).toBeVisible();
    const reconciledSnapshotResponse = await api.get(`/api/v1/dashboard/snapshot?date=${endDate}`, {
      headers: { authorization: user.authorization },
    });
    const reconciledSnapshot = (await reconciledSnapshotResponse.json()) as {
      data: { weight: { trendValue: number } };
    };
    expect(reconciledSnapshot.data.weight.trendValue).toBeCloseTo(
      reconciled.data.current.trendWeight,
    );
    await page.waitForLoadState('networkidle');
    diagnostics();
  } finally {
    await api.dispose();
  }
});

test('renders empty, one-weigh-in, and stale states without fabricated analytics', async ({
  page,
}) => {
  const endDate = dateKeyInDetroit();
  const api = await request.newContext({ baseURL: apiBaseURL });
  const diagnostics = monitorPage(page);
  try {
    const empty = await createTrendUser(api, endDate, 0);
    await setAuthenticatedSession(page, empty.token);
    await page.goto('/weight', { waitUntil: 'networkidle' });
    await expect(page.getByText('No trend data', { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('figure', { name: 'Scale and Trend Weight' })
        .getByText('Log your first weigh-in to start Trend Weight.'),
    ).toBeVisible();

    const user = await createTrendUser(api, endDate, 1);
    await setAuthenticatedSession(page, user.token);
    await page.goto('/weight', { waitUntil: 'networkidle' });
    await expect(page.getByText('Still learning', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Not available' })).toBeVisible();
    await expect(
      page.getByText('At least two recent weigh-ins are needed for Trend Weight.'),
    ).toBeVisible();

    const stale = await createTrendUser(api, endDate, 0);
    for (const [daysAgo, weight] of [
      [20, 181],
      [19, 180.5],
    ] as const) {
      const response = await api.post('/api/v1/weight', {
        data: { date: addDays(endDate, -daysAgo), unit: 'lbs', weight },
        headers: { authorization: stale.authorization },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    await setAuthenticatedSession(page, stale.token);
    await page.goto('/weight', { waitUntil: 'networkidle' });
    await expect(page.getByText('Trend may be stale', { exact: true })).toBeVisible();
    const summary = page.getByRole('article', {
      name: /lbs/,
    });
    await expect(summary.getByText('Recent pace', { exact: true })).toBeVisible();
    await expect(summary.getByText('Not available', { exact: true })).toBeVisible();
    await expect(page.getByText('Current estimate is stale').first()).toBeVisible();

    const expired = await createTrendUser(api, endDate, 0);
    for (const [daysAgo, weight] of [
      [40, 181],
      [39, 180.5],
    ] as const) {
      const response = await api.post('/api/v1/weight', {
        data: { date: addDays(endDate, -daysAgo), unit: 'lbs', weight },
        headers: { authorization: expired.authorization },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    await setAuthenticatedSession(page, expired.token);
    await page.goto('/weight', { waitUntil: 'networkidle' });
    await expect(page.getByText('Trend may be stale', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Not available' })).toBeVisible();
    await expect(page.locator('[data-slot="trend-weight-latest-scale"]')).toHaveText('180.5 lbs');
    await expect(
      page
        .getByRole('figure', { name: 'Scale and Trend Weight' })
        .getByText(
          'No recent weigh-ins fall inside this chart range. Latest scale remains listed above.',
        ),
    ).toBeVisible();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.getByRole('heading', { level: 1, name: 'Trend Weight' }).scrollIntoViewIfNeeded();
    await captureIssueScreenshot(page, 'issue-108-stale-320.png');
    await page.waitForLoadState('networkidle');
    diagnostics();
  } finally {
    await api.dispose();
  }
});

test('renders loss, maintenance, and gain goal semantics from server facts', async ({ page }) => {
  const endDate = dateKeyInDetroit();
  const api = await request.newContext({ baseURL: apiBaseURL });
  const diagnostics = monitorPage(page);
  try {
    for (const type of ['lose', 'maintain', 'gain'] as const) {
      const user = await createTrendUser(api, endDate, 30);
      await configureGoal(api, user.authorization, type);
      if (type === 'maintain') {
        const entriesResponse = await api.get('/api/v1/weight', {
          headers: { authorization: user.authorization },
        });
        const entries = (await entriesResponse.json()) as {
          data: Array<{ date: string; id: string }>;
        };
        const latestEntry = entries.data.find((entry) => entry.date === endDate);
        expect(latestEntry).toBeDefined();
        const deleteResponse = await api.delete(`/api/v1/weight/${latestEntry?.id}`, {
          headers: { authorization: user.authorization },
        });
        expect(deleteResponse.ok(), await deleteResponse.text()).toBeTruthy();
      }
      const response = await api.get(`/api/v1/weight/trend?range=1m&end=${endDate}`, {
        headers: { authorization: user.authorization },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const payload = (await response.json()) as {
        data: {
          goal: {
            actualRatePerWeek: number;
            desiredRatePerWeek: number;
            explanation: string;
            maintenanceBandState: string;
            paceState: string;
            type: string;
          };
        };
      };
      expect(payload.data.goal.type).toBe(type);
      if (type === 'lose') expect(payload.data.goal.desiredRatePerWeek).toBeLessThan(0);
      if (type === 'gain') expect(payload.data.goal.desiredRatePerWeek).toBeGreaterThan(0);
      if (type === 'maintain') expect(payload.data.goal.desiredRatePerWeek).toBe(0);

      await setAuthenticatedSession(page, user.token);
      await page.goto('/weight', { waitUntil: 'networkidle' });
      await expect(
        page.getByText(
          new RegExp(
            `^${type === 'lose' ? 'Loss' : type === 'gain' ? 'Gain' : 'Maintenance'} goal`,
          ),
        ),
      ).toBeVisible();
      const goalContext = page
        .getByRole('article')
        .filter({ has: page.getByRole('heading', { name: 'Goal context' }) });
      await expect(goalContext.getByText('Selected rate', { exact: true })).toBeVisible();
      await expect(
        goalContext.getByText(`${uiSignedWeight(payload.data.goal.desiredRatePerWeek)}/week`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        goalContext.getByText(payload.data.goal.explanation, { exact: false }),
      ).toBeVisible();
      if (type === 'maintain') {
        await expect(goalContext.getByText('Maintenance corridor', { exact: true })).toBeVisible();
        await expect(
          page.getByText(payload.data.goal.maintenanceBandState.replaceAll('_', ' '), {
            exact: false,
          }),
        ).toBeVisible();
        await page.setViewportSize({ width: 430, height: 900 });
        await page
          .getByRole('heading', { level: 1, name: 'Trend Weight' })
          .scrollIntoViewIfNeeded();
        const marker = page.locator(
          `[data-slot="trend-weight-marker-lane"] [data-date="${endDate}"]`,
        );
        await expect(marker).toContainText('2 events: Goal started + Check-in');
        for (const width of [320, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          const markerBox = await marker.boundingBox();
          const chartBox = await page
            .getByRole('figure', { name: 'Scale and Trend Weight' })
            .boundingBox();
          expect(markerBox).not.toBeNull();
          expect(chartBox).not.toBeNull();
          if (!markerBox || !chartBox) throw new Error('Marker lane was not measurable');
          expect(markerBox.x).toBeGreaterThanOrEqual(chartBox.x);
          expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(chartBox.x + chartBox.width);
          await expect(page.locator('.trend-weight-marker-line')).toHaveCount(1);
        }
        await page.setViewportSize({ width: 430, height: 900 });
        await captureIssueScreenshot(page, 'issue-108-maintenance-430.png');
      } else {
        await expect(goalContext.getByText('Goal target', { exact: true })).toBeVisible();
      }
    }
    diagnostics();
  } finally {
    await api.dispose();
  }
});

test('shows sparse gaps and deterministically replaces a same-day measurement', async ({
  page,
}) => {
  const endDate = dateKeyInDetroit();
  const api = await request.newContext({ baseURL: apiBaseURL });
  const diagnostics = monitorPage(page);
  try {
    const sparse = await createTrendUser(api, endDate, 0);
    for (const entry of [
      { date: addDays(endDate, -45), weight: 200 },
      { date: addDays(endDate, -44), weight: 199.5 },
      { date: addDays(endDate, -43), weight: 199 },
      { date: addDays(endDate, -10), weight: 180 },
      { date: addDays(endDate, -9), weight: 179.7 },
      { date: addDays(endDate, -8), weight: 179.4 },
      { date: endDate, weight: 179 },
    ]) {
      const response = await api.post('/api/v1/weight', {
        data: { ...entry, unit: 'lbs' },
        headers: { authorization: sparse.authorization },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    await setAuthenticatedSession(page, sparse.token);
    await page.goto('/weight', { waitUntil: 'networkidle' });
    await expect(page.getByText('Limited confidence', { exact: true })).toBeVisible();
    const allResponse = page.waitForResponse((value) =>
      value.url().includes('/api/v1/weight/trend?range=all'),
    );
    await page.getByRole('button', { name: 'All' }).click();
    await allResponse;
    await expect
      .poll(() => page.locator('.recharts-line .recharts-curve').count())
      .toBeGreaterThan(1);
    await expect(page.getByText('gaps are not bridged.', { exact: false })).toBeVisible();

    const replacement = await createTrendUser(api, endDate, 0);
    const first = await api.post('/api/v1/weight', {
      data: { date: endDate, unit: 'lbs', weight: 180 },
      headers: { authorization: replacement.authorization },
    });
    expect(first.status()).toBe(201);
    const second = await api.post('/api/v1/weight', {
      data: { date: endDate, unit: 'lbs', weight: 177 },
      headers: { authorization: replacement.authorization },
    });
    expect(second.status()).toBe(200);
    const replacementAnalytics = await api.get(`/api/v1/weight/trend?range=all&end=${endDate}`, {
      headers: { authorization: replacement.authorization },
    });
    const replacementPayload = (await replacementAnalytics.json()) as {
      data: {
        current: {
          latestScale: { createdAt: number; updatedAt: number; weight: number };
        };
        points: Array<{ scaleWeight: number }>;
      };
    };
    expect(replacementPayload.data.points).toHaveLength(1);
    expect(replacementPayload.data.current.latestScale.weight).toBe(177);
    expect(replacementPayload.data.current.latestScale.updatedAt).toBeGreaterThan(
      replacementPayload.data.current.latestScale.createdAt,
    );
    await setAuthenticatedSession(page, replacement.token);
    await page.goto('/weight', { waitUntil: 'networkidle' });
    await expect(page.getByText('Still learning', { exact: true })).toBeVisible();
    await expect(page.locator('[data-slot="trend-weight-latest-scale"]')).toHaveText('177 lbs');
    await expect(
      page.getByText(uiUpdatedAt(replacementPayload.data.current.latestScale.updatedAt), {
        exact: true,
      }),
    ).toBeVisible();
    diagnostics();
  } finally {
    await api.dispose();
  }
});

const dateZoneCases = [
  {
    name: 'Detroit',
    screenshots: [] as Array<{ filename: string; width: number }>,
    timeZone: 'America/Detroit',
  },
  {
    name: 'Tokyo',
    screenshots: [{ filename: 'issue-108-tokyo-768.png', width: 768 }],
    timeZone: 'Asia/Tokyo',
  },
  {
    name: 'Kiritimati',
    screenshots: [
      { filename: 'issue-108-kiritimati-390.png', width: 390 },
      { filename: 'issue-108-kiritimati-1280.png', width: 1280 },
    ],
    timeZone: 'Pacific/Kiritimati',
  },
  {
    name: 'GMT plus 12',
    screenshots: [{ filename: 'issue-108-gmt-plus12-320.png', width: 320 }],
    timeZone: 'Etc/GMT+12',
  },
] as const;

for (const scenario of dateZoneCases) {
  test.describe(`Trend Weight literal dates in ${scenario.name}`, () => {
    test.use({ timezoneId: scenario.timeZone });

    test('keeps chart, inspection, markers, table, and ranges on server date keys', async ({
      page,
    }) => {
      const endDate = dateKeyInTimeZone(scenario.timeZone);
      const api = await request.newContext({ baseURL: apiBaseURL });
      const diagnostics = monitorPage(page);

      try {
        const user = await createTrendUser(api, addDays(endDate, -1), 30);
        await configureGoal(api, user.authorization, 'lose', scenario.timeZone);
        await reviseGoal(api, user.authorization);
        await setAuthenticatedSession(page, user.token);

        const initialResponsePromise = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            response.request().method() === 'GET' &&
            url.pathname === '/api/v1/weight/trend' &&
            url.searchParams.get('range') === '1m' &&
            url.searchParams.get('timeZone') === scenario.timeZone &&
            !url.searchParams.has('end')
          );
        });
        await page.goto('/weight', { waitUntil: 'networkidle' });
        const initialResponse = await initialResponsePromise;
        expect(initialResponse.ok(), await initialResponse.text()).toBeTruthy();
        const initial = ((await initialResponse.json()) as { data: TrendWeightAnalytics }).data;

        expect(initial.timeZone).toBe(scenario.timeZone);
        expect(initial.range.endDate).toBe(endDate);
        await expectLiteralAxisRange(page, initial.range);

        const firstPoint = initial.points[0];
        const invariantPoint = initial.points.at(-1);
        expect(firstPoint).toBeDefined();
        expect(invariantPoint?.trendWeight).not.toBeNull();
        if (!firstPoint || !invariantPoint || invariantPoint.trendWeight === null) {
          throw new Error('Expected first and invariant Trend Weight points with a trend value');
        }
        expect(initial.points.some((point) => point.date === endDate)).toBe(false);

        const firstDot = page.locator('.recharts-scatter-symbol').first();
        await firstDot.hover();
        await expect(page.locator('[data-slot="trend-weight-tooltip"]')).toContainText(
          uiDate(firstPoint.date),
        );
        await firstDot.click();
        await expect(page.locator('[data-slot="trend-weight-point-detail"]')).toContainText(
          uiDate(firstPoint.date),
        );

        await page.getByRole('button', { name: 'Show exact values' }).press('Enter');
        const table = page.getByRole('table', { name: 'Exact Scale and Trend Weight values' });
        await expect(
          table.getByRole('button', { name: uiDate(firstPoint.date), exact: true }),
        ).toBeVisible();
        await expect(
          table.getByRole('button', { name: uiDate(invariantPoint.date), exact: true }),
        ).toBeVisible();

        const endMarkers = initial.markers.filter((marker) => marker.date === endDate);
        expect(endMarkers.length).toBeGreaterThan(0);
        expect(endMarkers.map((marker) => marker.kind)).toEqual(
          expect.arrayContaining(['goal_started', 'goal_revised', 'check_in']),
        );
        const markerPill = page.locator(
          `[data-slot="trend-weight-marker-lane"] [data-date="${endDate}"]`,
        );
        await expect(markerPill).toContainText(uiDate(endDate));
        const annotations = page.getByRole('region', { name: 'Annotations' });
        for (const kind of ['goal_started', 'goal_revised', 'check_in'] as const) {
          const marker = endMarkers.find((candidate) => candidate.kind === kind);
          expect(marker).toBeDefined();
          if (!marker) throw new Error(`Expected ${kind} marker on ${endDate}`);
          await expect(
            annotations
              .getByText(`${uiDate(endDate)} · ${marker.label} · ${kind.replaceAll('_', ' ')}`, {
                exact: true,
              })
              .first(),
          ).toBeVisible();
        }

        const markerLine = page.locator('.trend-weight-marker-line line').last();
        const markerX = Number(await markerLine.getAttribute('x1'));
        const plotClip = page.locator('.recharts-wrapper clipPath rect').first();
        const plotRight =
          Number(await plotClip.getAttribute('x')) + Number(await plotClip.getAttribute('width'));
        expect(markerX).toBeGreaterThan(0);
        expect(Math.abs(markerX - plotRight)).toBeLessThanOrEqual(0.5);

        for (const next of [
          { label: '3M', value: '3m' },
          { label: '6M', value: '6m' },
          { label: '1Y', value: '1y' },
          { label: 'All', value: 'all' },
        ] as const) {
          const responsePromise = page.waitForResponse((response) => {
            const url = new URL(response.url());
            return (
              response.request().method() === 'GET' &&
              url.pathname === '/api/v1/weight/trend' &&
              url.searchParams.get('range') === next.value
            );
          });
          await page.getByRole('button', { name: next.label }).press('Space');
          const response = await responsePromise;
          expect(response.ok(), await response.text()).toBeTruthy();
          const analytics = ((await response.json()) as { data: TrendWeightAnalytics }).data;
          const samePoint = analytics.points.find(
            (point) => point.sourceEntryId === invariantPoint.sourceEntryId,
          );
          expect(samePoint?.date).toBe(invariantPoint.date);
          expect(samePoint?.trendWeight).toBe(invariantPoint.trendWeight);
          await expectLiteralAxisRange(page, analytics.range);
          const invariantRow = table
            .getByRole('button', { name: uiDate(invariantPoint.date), exact: true })
            .locator('..')
            .locator('..');
          await expect(invariantRow).toBeVisible();
          await expect(invariantRow.locator('td').nth(2)).toHaveText(
            uiWeight(invariantPoint.trendWeight),
          );
        }

        const invariantDot = page.locator('.recharts-scatter-symbol').last();
        await invariantDot.hover();
        await expect(page.locator('[data-slot="trend-weight-tooltip"]')).toContainText(
          uiDate(invariantPoint.date),
        );
        await expect(page.locator('[data-slot="trend-weight-tooltip"]')).toContainText(
          `Trend ${uiWeight(invariantPoint.trendWeight)}`,
        );
        await invariantDot.click();
        await expect(page.locator('[data-slot="trend-weight-point-detail"]')).toContainText(
          uiDate(invariantPoint.date),
        );

        for (const width of [320, 390, 430, 768, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            ),
            `${scenario.timeZone} ${width}px page overflow`,
          ).toBe(true);
        }

        for (const screenshot of scenario.screenshots) {
          await page.setViewportSize({ width: screenshot.width, height: 900 });
          await page
            .getByRole('heading', { level: 1, name: 'Trend Weight' })
            .scrollIntoViewIfNeeded();
          await captureIssueScreenshot(page, screenshot.filename);
        }

        if (scenario.timeZone === 'Pacific/Kiritimati') {
          await page.goto('/', { waitUntil: 'networkidle' });
          const compact = page.locator('[data-slot="weight-trend-chart"]');
          await expect(compact).toBeVisible();
          const compactLabels = await compact
            .locator('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')
            .allTextContents();
          expect(compactLabels[0]).toBe(uiAxisDate(initial.range.startDate));
          expect(compactLabels.at(-1)).toBe(uiAxisDate(initial.range.endDate));
          const compactFirstDot = compact.locator('.recharts-scatter-symbol').first();
          await compactFirstDot.hover();
          await expect(compact.locator('[data-slot="trend-weight-tooltip"]')).toContainText(
            uiDate(firstPoint.date),
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            ),
          ).toBe(true);
        }

        await page.waitForLoadState('networkidle');
        diagnostics();
      } finally {
        await api.dispose();
      }
    });
  });
}

test.describe('Trend Weight literal dates across Detroit DST', () => {
  test.use({ timezoneId: 'America/Detroit' });

  test('keeps spring-forward points and a correction marker on their literal dates', async ({
    page,
  }) => {
    const endDate = dateKeyInDetroit();
    const api = await request.newContext({ baseURL: apiBaseURL });
    const diagnostics = monitorPage(page);

    try {
      const user = await createTrendUser(api, endDate, 0);
      let correctedEntryId = '';
      for (const [date, weight] of [
        ['2026-03-07', 184],
        ['2026-03-08', 183.5],
        ['2026-03-09', 183],
        [addDays(endDate, -1), 180.5],
        [endDate, 180],
      ] as const) {
        const response = await api.post('/api/v1/weight', {
          data: { date, unit: 'lbs', weight },
          headers: { authorization: user.authorization },
        });
        expect(response.ok(), await response.text()).toBeTruthy();
        if (date === '2026-03-08') {
          correctedEntryId = ((await response.json()) as { data: { id: string } }).data.id;
        }
      }
      const correction = await api.patch(`/api/v1/weight/${correctedEntryId}`, {
        data: { weight: 183.25 },
        headers: { authorization: user.authorization },
      });
      expect(correction.ok(), await correction.text()).toBeTruthy();

      await setAuthenticatedSession(page, user.token);
      await page.goto('/weight', { waitUntil: 'networkidle' });
      const allResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === '/api/v1/weight/trend' && url.searchParams.get('range') === 'all';
      });
      await page.getByRole('button', { name: 'All' }).press('Space');
      const allResponse = await allResponsePromise;
      expect(allResponse.ok(), await allResponse.text()).toBeTruthy();
      const analytics = ((await allResponse.json()) as { data: TrendWeightAnalytics }).data;

      await expectLiteralAxisRange(page, analytics.range);
      const marchDates = ['2026-03-07', '2026-03-08', '2026-03-09'];
      expect(analytics.points.slice(0, 3).map((point) => point.date)).toEqual(marchDates);

      const march8Index = analytics.points.findIndex((point) => point.date === '2026-03-08');
      expect(march8Index).toBeGreaterThanOrEqual(0);
      const march8Dot = page.locator('.recharts-scatter-symbol').nth(march8Index);
      await march8Dot.hover();
      await expect(page.locator('[data-slot="trend-weight-tooltip"]')).toContainText('Mar 8, 2026');
      await march8Dot.click();
      await expect(page.locator('[data-slot="trend-weight-point-detail"]')).toContainText(
        'Mar 8, 2026',
      );

      await page.getByRole('button', { name: 'Show exact values' }).press('Enter');
      const table = page.getByRole('table', { name: 'Exact Scale and Trend Weight values' });
      for (const date of marchDates) {
        await expect(table.getByRole('button', { name: uiDate(date), exact: true })).toBeVisible();
      }
      const correctionMarker = page.locator(
        '[data-slot="trend-weight-marker-lane"] [data-date="2026-03-08"]',
      );
      await expect(correctionMarker).toContainText('Mar 8, 2026');
      await expect(correctionMarker).toContainText('Corrected weigh-in');

      const correctionLine = page.locator('.trend-weight-marker-line line').first();
      const correctionX = Number(await correctionLine.getAttribute('x1'));
      const dotX = await chartDotX(march8Dot);
      expect(Math.abs(correctionX - dotX)).toBeLessThanOrEqual(0.5);

      await page.setViewportSize({ width: 430, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await page.getByRole('heading', { level: 1, name: 'Trend Weight' }).scrollIntoViewIfNeeded();
      await captureIssueScreenshot(page, 'issue-108-detroit-dst-430.png');
      await page.waitForLoadState('networkidle');
      diagnostics();
    } finally {
      await api.dispose();
    }
  });
});
