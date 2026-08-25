import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { adaptivePreviewFixtureContract } from './adaptive-preview-fixture-contract';
import { apiBaseURL } from './test-env';

const password = 'chart-exploration-preview-only';
let api: APIRequestContext;

function dateKeyInDetroit() {
  return adaptivePreviewFixtureContract.anchorDate;
}

function addDays(date: string, days: number) {
  const coordinate = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(coordinate).toISOString().slice(0, 10);
}

function uiDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(Date.parse(`${date}T00:00:00Z`));
}

async function registerUser(prefix: string) {
  const username = `${prefix}-${randomUUID().slice(0, 8)}`;
  const response = await api.post('/api/v1/auth/register', {
    data: { password, username },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = (await response.json()) as { data: { token: string } };
  return {
    authorization: `Bearer ${payload.data.token}`,
    token: payload.data.token,
  };
}

async function openAuthenticated(page: Page, token: string, path: string) {
  await setAuthenticatedSession(page, token);
  await page.goto(path, { waitUntil: 'networkidle' });
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
    if (response.status() >= 400) failures.push(`http ${response.status()}: ${response.url()}`);
  });
  return () => expect(failures, 'browser diagnostics').toEqual([]);
}

async function expectNoOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator('[data-slot="chart-frame"]')
        .evaluateAll((frames) =>
          frames.every((frame) => frame.scrollWidth <= frame.clientWidth + 1),
        ),
    )
    .toBe(true);
}

async function expectRangeTargets(page: Page, label: string) {
  const group = page.getByRole('group', { name: label });
  for (const button of await group.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
}

async function capture(page: Page, name: string) {
  if (process.env.CAPTURE_ISSUE_110_SCREENSHOTS !== '1') return;
  const directory = resolve(process.cwd(), '../../artifacts/issue-110');
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ fullPage: true, path: resolve(directory, name) });
}

async function captureElement(page: Page, selector: ReturnType<Page['locator']>, name: string) {
  if (process.env.CAPTURE_ISSUE_110_SCREENSHOTS !== '1') return;
  const directory = resolve(process.cwd(), '../../artifacts/issue-110');
  mkdirSync(directory, { recursive: true });
  await selector.screenshot({ path: resolve(directory, name) });
}

test.beforeAll(async () => {
  api = await request.newContext({ baseURL: apiBaseURL });
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(adaptivePreviewFixtureContract.serverNow));
});

test.afterAll(async () => {
  await api.dispose();
});

test.describe('mobile multi-series exploration', () => {
  test.use({ hasTouch: true, reducedMotion: 'reduce', viewport: { height: 844, width: 390 } });

  test('inspects nutrition gaps by touch and keyboard without fabricating zeros', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    const user = await registerUser('chart-nutrition');
    const today = dateKeyInDetroit();

    for (const [date, calories] of [
      [addDays(today, -2), 2000],
      [today, 2200],
    ] as const) {
      const response = await api.post(`/api/v1/nutrition/${date}/meals`, {
        data: {
          name: `Chart fixture ${date}`,
          items: [
            {
              amount: 1,
              calories,
              carbs: 200,
              fat: 70,
              name: 'Complete plate',
              protein: 150,
              unit: 'serving',
            },
          ],
        },
        headers: { authorization: user.authorization },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
    }

    await openAuthenticated(page, user.token, '/nutrition?view=trends');
    await expect(page.getByRole('figure', { name: 'Macro trends' })).toBeVisible();
    await expect(page.getByText('Missing days remain gaps, not zeros.')).toBeVisible();
    await expectRangeTargets(page, 'Nutrition trends range');

    const oneWeek = page.getByRole('button', { name: '1W' });
    await oneWeek.focus();
    await oneWeek.press('Enter');
    await expect(oneWeek).toHaveAttribute('aria-pressed', 'true');

    const visual = page.getByRole('img', { name: 'Nutrition macro trend chart' });
    const visualBox = await visual.boundingBox();
    if (!visualBox) throw new Error('Nutrition trend visual is not visible');
    await page.touchscreen.tap(
      visualBox.x + visualBox.width - 12,
      visualBox.y + visualBox.height / 2,
    );
    await expect(page.getByLabel('Selected chart point')).toContainText(uiDate(today));
    await expect(page.getByLabel('Selected chart point')).toContainText('Calories 2200 kcal');

    const disclosure = page.getByText('View exact chart values');
    await disclosure.tap();
    const exactValues = page.locator('details[data-slot="chart-data-table"]');
    await expect(exactValues).toHaveAttribute('open', '');
    const missingDate = addDays(today, -1);
    const missingRow = page.getByRole('row', { name: new RegExp(uiDate(missingDate)) });
    await expect(missingRow.getByText('Not available')).toHaveCount(4);

    const exactRow = page.getByRole('button', {
      name: new RegExp(`Inspect ${uiDate(addDays(today, -2))}`),
    });
    await exactRow.focus();
    await exactRow.press('Enter');
    await expect(page.getByLabel('Selected chart point')).toContainText(uiDate(addDays(today, -2)));
    await expectNoOverflow(page);
    await capture(page, 'chart-exploration-nutrition-390.png');
    await page.waitForLoadState('networkidle');
    diagnostics();
  });
});

test('explores exercise history with exact units and reference-date ranges', async ({ page }) => {
  const diagnostics = monitorPage(page);
  const user = await registerUser('chart-exercise');
  const exerciseName = 'Chart QA Press';
  const create = await api.post('/api/v1/exercises', {
    data: {
      category: 'compound',
      equipment: 'dumbbell',
      muscleGroups: ['chest'],
      name: exerciseName,
      trackingType: 'weight_reps',
    },
    headers: { authorization: user.authorization },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  const exercise = (await create.json()) as { data: { id: string } };

  await page.route(`**/api/v1/exercises/${exercise.data.id}/history?limit=10`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [
          {
            date: '2026-01-05',
            notes: null,
            sessionId: 'chart-session-1',
            sets: [{ reps: 10, setNumber: 1, weight: 40 }],
          },
          {
            date: '2026-02-09',
            notes: null,
            sessionId: 'chart-session-2',
            sets: [{ reps: 8, setNumber: 1, weight: 50 }],
          },
          {
            date: '2026-03-01',
            notes: null,
            sessionId: 'chart-session-3a',
            sets: [{ reps: 7, setNumber: 1, weight: 55 }],
          },
          {
            date: '2026-03-01',
            notes: null,
            sessionId: 'chart-session-3b',
            sets: [{ reps: 7, setNumber: 1, weight: 60 }],
          },
        ],
      },
      status: 200,
    });
  });

  await openAuthenticated(
    page,
    user.token,
    `/workouts?view=exercises&q=${encodeURIComponent(exerciseName)}`,
  );
  await page.getByRole('button', { exact: true, name: exerciseName }).click();
  await page.getByRole('tab', { name: 'Trends' }).click();
  await expect(page.getByRole('figure', { name: exerciseName })).toBeVisible();
  await expect(page.getByLabel('Selected exercise range summary')).toContainText('60 lbs');
  await expectRangeTargets(page, 'Trend date range');

  const firstDot = page.locator('.recharts-line-dots circle').first();
  await firstDot.hover();
  await expect(page.getByRole('tooltip')).toContainText('Jan 5, 2026');
  await expect(page.getByRole('tooltip')).toContainText('Max Weight 40 lbs');

  await page.getByText('View exact chart values').click();
  await page.getByRole('button', { name: /Inspect Jan 5, 2026/ }).press('Enter');
  await expect(page.getByLabel('Selected chart point')).toContainText('Max Weight 40 lbs');
  const secondSameDateSession = page.getByRole('button', {
    name: /Inspect Mar 1, 2026 · session 2 of 2/,
  });
  await secondSameDateSession.focus();
  await secondSameDateSession.press('Enter');
  await expect(page.getByLabel('Selected chart point')).toContainText('Session 2 of 2');
  await expect(page.getByLabel('Selected chart point')).toContainText('Max Weight 60 lbs');
  await page.setViewportSize({ height: 900, width: 768 });
  await expectNoOverflow(page);
  await capture(page, 'chart-exploration-exercise-768.png');
  await page.waitForLoadState('networkidle');
  diagnostics();
});

test.describe('injury severity inspection', () => {
  test.use({ hasTouch: true });

  test('renders injury annotations, exact severity inspection, themes, and modeled rows', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    const user = await registerUser('chart-injury');
    await openAuthenticated(page, user.token, '/profile/injuries/shoulder-slap-tear-right');

    await expect(page.getByRole('figure', { name: 'Pain / Severity Over Time' })).toBeVisible();
    await expect(page.getByLabel('Selected severity range summary')).toContainText(
      'Latest severity0 / 10',
    );
    await expectRangeTargets(page, 'Severity date range');
    await page.getByRole('button', { name: 'All' }).click();
    const ordinaryPoint = page.locator(
      '[data-slot="severity-point-marker"][data-date="2025-03-18"] circle[tabindex="0"]',
    );
    await ordinaryPoint.hover();
    await expect(page.getByRole('tooltip')).toContainText('Mar 18, 2025');
    await expect(page.getByRole('tooltip')).toContainText('Severity 7 / 10');
    await expect(page.getByRole('tooltip')).toContainText('State Recorded check-in');

    const eventPoint = page.locator(
      '[data-slot="severity-point-marker"][data-date="2025-08-21"] circle[tabindex="0"]',
    );
    await eventPoint.hover();
    await expect(page.getByRole('tooltip')).toContainText('Severity 5 / 10');
    await expect(page.getByRole('tooltip')).toContainText(
      'Short flare-up after pushing a high-volume chest day too aggressively.',
    );
    await eventPoint.tap();
    await expect(page.getByLabel('Selected chart point')).toContainText('Severity 5 of 10');
    await expect(page.getByLabel('Selected chart point')).toContainText('Flare');

    const annotation = page.getByRole('button', { name: /Flare: Short flare-up/ });
    await annotation.focus();
    await annotation.press('Enter');
    await expect(page.getByLabel('Selected chart point')).toContainText('Flare');
    await page.getByText('View exact chart values').click();
    await expect(page.getByRole('cell', { name: '0 / 10' })).toBeVisible();

    for (const [theme, width] of [
      ['light', 320],
      ['dark', 430],
      ['midnight', 1280],
    ] as const) {
      await page.evaluate((value) => window.localStorage.setItem('pulse-theme', value), theme);
      await page.reload({ waitUntil: 'networkidle' });
      await page.setViewportSize({ height: 900, width });
      await expect(page.getByRole('figure', { name: 'Pain / Severity Over Time' })).toBeVisible();
      await expectNoOverflow(page);
      await capture(page, `chart-exploration-injury-${theme}-${width}.png`);
      await captureElement(
        page,
        page.getByRole('figure', { name: 'Pain / Severity Over Time' }),
        `chart-exploration-injury-chart-${theme}-${width}.png`,
      );
    }
    diagnostics();
  });
});

test('keeps the dashboard Trend Weight wrapper on shared controls at desktop width', async ({
  page,
}) => {
  const diagnostics = monitorPage(page);
  const user = await registerUser('chart-weight');
  const today = dateKeyInDetroit();
  for (const [offset, weight] of [
    [-2, 182],
    [-1, 181.5],
    [0, 181],
  ] as const) {
    const response = await api.post('/api/v1/weight', {
      data: { date: addDays(today, offset), unit: 'lbs', weight },
      headers: { authorization: user.authorization },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  await openAuthenticated(page, user.token, '/');
  const chart = page.locator('[data-slot="weight-trend-chart"]');
  await expect(chart.getByRole('figure', { name: 'Scale and Trend Weight' })).toBeVisible();
  await expectRangeTargets(page, 'Trend Weight range');
  const exactValues = chart.getByText('View exact Trend Weight values');
  await exactValues.focus();
  await exactValues.press('Enter');
  const earliestPoint = chart.getByRole('button', {
    name: new RegExp(`Inspect ${uiDate(addDays(today, -2))}`),
  });
  await earliestPoint.focus();
  await earliestPoint.press('Enter');
  await expect(chart.getByLabel('Selected Trend Weight point')).toContainText(
    uiDate(addDays(today, -2)),
  );
  await expect(earliestPoint).toBeFocused();
  await page.setViewportSize({ height: 900, width: 1280 });
  await expectNoOverflow(page);
  await capture(page, 'chart-exploration-dashboard-1280.png');
  await page.waitForLoadState('networkidle');
  diagnostics();
});
