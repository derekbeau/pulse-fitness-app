import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type { DataQualityCalendar } from '@pulse/shared';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'America/Detroit' });

const username = 'adaptive-preview-dq-calendar';
const password = 'adaptive-preview-only';
let api: APIRequestContext;
let token: string;
let agentToken: { id: string; token: string };

function dateKeyInDetroit() {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Detroit',
    year: 'numeric',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function uiDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function monthGridRange(date: string) {
  const first = `${date.slice(0, 7)}-01`;
  const firstValue = new Date(`${first}T00:00:00.000Z`);
  const start = addDays(first, -((firstValue.getUTCDay() + 6) % 7));
  const next = new Date(firstValue);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(next.toISOString().slice(0, 10), -1);
  return { start, end: addDays(last, (7 - new Date(`${last}T00:00:00.000Z`).getUTCDay()) % 7) };
}

function monitorPage(page: Page) {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
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

async function openCalendar(page: Page, throughNavigation = false) {
  await setAuthenticatedSession(page, token);
  const calendarResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/data-quality/calendar?') && response.status() === 200,
  );
  if (throughNavigation) {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Data Quality' }).click();
  } else {
    await page.goto('/data-quality', { waitUntil: 'domcontentloaded' });
  }
  const response = await calendarResponse;
  const payload = (await response.json()) as { data: DataQualityCalendar };
  await expect(page.getByRole('heading', { level: 1, name: 'Data Quality & Trust' })).toBeVisible();
  await expect(page.getByText('Audit, not score')).toBeVisible();
  await page.waitForLoadState('networkidle');
  return payload.data;
}

async function selectDay(page: Page, date: string) {
  const day = page.getByRole('button', { name: new RegExp(`^${uiDate(date)}[.]`) });
  await day.focus();
  await page.keyboard.press('Enter');
  await expect(day).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: uiDate(date) })).toBeVisible();
}

async function capture(page: Page, filename: string) {
  const directory = resolve(process.cwd(), '../../artifacts/issue-111');
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ fullPage: true, path: resolve(directory, filename) });
}

async function expectNoOverflowAndTouchTargets(page: Page, width: number) {
  const calendarAncestors = await page
    .getByTestId('data-quality-calendar-scroller')
    .evaluate((element) => {
      const values: Array<Record<string, unknown>> = [];
      for (let current: HTMLElement | null = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        values.push({
          className: current.className,
          overflowX: style.overflowX,
          rect: current.getBoundingClientRect().toJSON(),
          scrollWidth: current.scrollWidth,
          tag: current.tagName,
        });
      }
      return values;
    });
  const overflowingElements = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return [...document.body.querySelectorAll<HTMLElement>('*')]
      .map((element) => ({
        className: element.className,
        name: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 80),
        rect: element.getBoundingClientRect().toJSON(),
        tag: element.tagName,
      }))
      .filter(({ rect }) => rect.left < -1 || rect.right > viewportWidth + 1)
      .slice(0, 10);
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    `${width}px page overflow: ${JSON.stringify({ calendarAncestors, overflowingElements })}`,
  ).toBe(true);
  const domainGroup = page.getByRole('group', { name: 'Calendar domains' });
  for (const control of await domainGroup.getByRole('button').all()) {
    const box = await control.boundingBox();
    expect(
      box?.height ?? 0,
      `${width}px ${await control.textContent()} touch target`,
    ).toBeGreaterThanOrEqual(44);
  }
  for (const day of await page.locator('button[data-date]').all()) {
    const box = await day.boundingBox();
    if (!box || box.x + box.width <= 0 || box.x >= width) continue;
    expect(box.width, `${width}px visible day width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${width}px visible day height`).toBeGreaterThanOrEqual(44);
  }
}

test.describe.serial('Data Quality calendar', () => {
  test.beforeAll(async () => {
    api = await request.newContext({ baseURL: apiBaseURL });
    const login = await api.post('/api/v1/auth/login', { data: { password, username } });
    expect(login.ok(), await login.text()).toBeTruthy();
    token = ((await login.json()) as { data: { token: string } }).data.token;
    const created = await api.post('/api/v1/agent-tokens', {
      data: { name: 'Data Quality browser parity' },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(created.status(), await created.text()).toBe(201);
    agentToken = ((await created.json()) as { data: { id: string; token: string } }).data;
  });

  test.afterAll(async () => {
    if (agentToken) {
      const removed = await api.delete(`/api/v1/agent-tokens/${agentToken.id}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(removed.ok(), await removed.text()).toBeTruthy();
    }
    await api.dispose();
  });

  test('navigates from More and audits cross-domain facts with exact AgentToken parity', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ height: 1000, width: 390 });
    const calendar = await openCalendar(page, true);
    const contextDate = calendar.days.find((day) =>
      day.contexts.some((context) => context.note.includes('Migraine reduced appetite')),
    )?.date;
    if (!contextDate) throw new Error('Data Quality context fixture is missing');
    await selectDay(page, contextDate);

    await expect(page.getByRole('heading', { name: 'Nutrition' })).toBeVisible();
    await expect(
      page.getByText('Migraine reduced appetite and changed the planned training day.'),
    ).toBeVisible();
    await expect(page.getByText('AgentToken · Preview Coach')).toBeVisible();
    await expect(page.getByText('date · revision 1', { exact: false })).toBeVisible();
    await expect(page.getByText('partial', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText(
        'Context explains evidence but never changes status or calculations by itself.',
      ),
    ).toBeVisible();

    const url = `/api/v1/data-quality/calendar?start=${calendar.range.startDate}&end=${calendar.range.endDate}`;
    const [jwtResponse, agentResponse] = await Promise.all([
      api.get(url, { headers: { authorization: `Bearer ${token}` } }),
      api.get(url, { headers: { authorization: `AgentToken ${agentToken.token}` } }),
    ]);
    expect(jwtResponse.ok(), await jwtResponse.text()).toBeTruthy();
    expect(agentResponse.ok(), await agentResponse.text()).toBeTruthy();
    expect((await agentResponse.json()).data).toEqual((await jwtResponse.json()).data);

    const weightFilter = page.getByRole('button', { exact: true, name: 'Weight' });
    await weightFilter.focus();
    await page.keyboard.press('Space');
    await expect(weightFilter).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('heading', { name: 'Weight' })).toHaveCount(0);
    await page.keyboard.press('Space');
    await expect(weightFilter).toHaveAttribute('aria-pressed', 'true');

    await expectNoOverflowAndTouchTargets(page, 390);
    await capture(page, 'data-quality-context-390.png');
    diagnostics();
  });

  test('keeps missing, cutoff, correction limitations, planned, and completed evidence distinct', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ height: 1000, width: 430 });
    const calendar = await openCalendar(page);
    const correctionDate = calendar.days.find(
      (day) => day.weight.correctionState === 'history_unavailable' && day.weight.entry !== null,
    )?.date;
    const missingDate = calendar.days.find(
      (day) =>
        day.nutrition.qualityState === 'no_records' &&
        day.workouts.some((item) => item.state === 'planned'),
    )?.date;
    const completedWorkoutDate = calendar.days.find((day) =>
      day.workouts.some((item) => item.state === 'completed'),
    )?.date;
    if (!correctionDate || !missingDate || !completedWorkoutDate) {
      throw new Error('Data Quality deterministic evidence dates are missing');
    }

    await selectDay(page, correctionDate);
    await expect(page.getByText('Correction history unavailable').first()).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Weight' }).getByText('Logged', { exact: true }),
    ).toBeVisible();

    await selectDay(page, missingDate);
    await expect(page.getByText('No record', { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Weight' })
        .getByText('No weigh-in', { exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Workout' }).getByText('planned', { exact: true }).first(),
    ).toBeVisible();

    await selectDay(page, completedWorkoutDate);
    await expect(page.getByText('Cross-domain strength session')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Workout' }).getByText('completed', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Workout' }).getByText('Correction history unavailable'),
    ).toBeVisible();
    await capture(page, 'data-quality-workout-430.png');

    const latestEvidenceDay = calendar.days
      .filter((day) => day.nutrition.qualityState === 'complete' && day.weight.entry !== null)
      .at(-1);
    if (!latestEvidenceDay) throw new Error('Data Quality latest evidence day is missing');
    await selectDay(page, latestEvidenceDay.date);
    const latestNutritionTreatment = latestEvidenceDay.nutrition.evidenceState.replaceAll('_', ' ');
    const latestWeightTreatment = latestEvidenceDay.weight.evidenceState.replaceAll('_', ' ');
    await expect(
      page
        .getByRole('region', { name: 'Nutrition' })
        .getByText(latestNutritionTreatment, { exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Weight' })
        .getByText(latestWeightTreatment, { exact: true })
        .first(),
    ).toBeVisible();
    diagnostics();
  });

  test('creates bounded context without changing the selected date algorithm state', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ height: 1000, width: 320 });
    const calendar = await openCalendar(page);
    const today = calendar.days.find((day) => day.isToday)?.date ?? dateKeyInDetroit();
    const date = addDays(today, -1);
    await selectDay(page, date);
    const originalProgramState = await page
      .getByText('Program state')
      .locator('..')
      .locator('dd')
      .textContent();

    const contextResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/adaptive-nutrition/review-context') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    );
    await page.getByRole('button', { name: 'Add context' }).click();
    await page.getByLabel('Context type').selectOption('recovery');
    await page
      .getByLabel('What should Pulse know?')
      .fill('Recovery session was intentionally lighter.');
    await page.getByRole('dialog').getByRole('button', { name: 'Add context' }).click();
    const created = (await (await contextResponse).json()) as {
      data: { id: string; revision: number };
    };
    try {
      await expect(page.getByText('Recovery session was intentionally lighter.')).toBeVisible();
      await expect(page.getByText('Program state').locator('..').locator('dd')).toHaveText(
        originalProgramState ?? '',
      );
      await expectNoOverflowAndTouchTargets(page, 320);
      await capture(page, 'data-quality-context-created-320.png');
    } finally {
      const removed = await api.delete(
        `/api/v1/adaptive-nutrition/review-context/${created.data.id}?expectedRevision=${created.data.revision}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(removed.ok(), await removed.text()).toBeTruthy();
    }
    diagnostics();
  });

  test('stays usable without overflow at tablet and desktop widths', async ({ page }) => {
    const diagnostics = monitorPage(page);
    const calendar = await openCalendar(page);
    const today = calendar.days.find((day) => day.isToday)?.date ?? dateKeyInDetroit();
    await selectDay(page, today);
    for (const width of [320, 390, 430, 768, 1280]) {
      await page.setViewportSize({ height: 1000, width });
      await expectNoOverflowAndTouchTargets(page, width);
      await capture(page, `data-quality-calendar-${width}.png`);
    }
    diagnostics();
  });

  test('bootstraps the authoritative program-local month in opposite browser zones and DST boundaries', async ({
    browser,
  }) => {
    const cases = [
      { timezoneId: 'Pacific/Kiritimati', today: '2026-08-31' },
      { timezoneId: 'Etc/GMT+12', today: '2027-01-01' },
      { timezoneId: 'Asia/Tokyo', today: '2026-03-08' },
      { timezoneId: 'America/Detroit', today: '2026-11-01' },
    ] as const;
    const webBaseURL = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? '4173'}`;

    for (const testCase of cases) {
      const range = monthGridRange(testCase.today);
      const sourceResponse = await api.get(
        `/api/v1/data-quality/calendar?start=${range.start}&end=${range.end}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      expect(sourceResponse.ok(), await sourceResponse.text()).toBeTruthy();
      const fixed = ((await sourceResponse.json()) as { data: DataQualityCalendar }).data;
      fixed.today = testCase.today;
      fixed.days = fixed.days.map((day) => ({ ...day, isToday: day.date === testCase.today }));

      const context = await browser.newContext({
        baseURL: webBaseURL,
        timezoneId: testCase.timezoneId,
      });
      const page = await context.newPage();
      const diagnostics = monitorPage(page);
      const requestUrls: string[] = [];
      await page.route('**/api/v1/data-quality/calendar*', async (route) => {
        requestUrls.push(route.request().url());
        await route.fulfill({ status: 200, json: { data: fixed } });
      });
      try {
        await setAuthenticatedSession(page, token);
        await page.goto('/data-quality', { waitUntil: 'domcontentloaded' });
        await expect(
          page.getByRole('heading', {
            name: new Intl.DateTimeFormat('en-US', {
              month: 'long',
              timeZone: 'UTC',
              year: 'numeric',
            }).format(new Date(`${testCase.today.slice(0, 7)}-01T00:00:00.000Z`)),
          }),
        ).toBeVisible();
        await expect(page.getByLabel('Jump to date')).toHaveValue(testCase.today);
        await page.waitForLoadState('networkidle');
        expect(new URL(requestUrls[0] ?? '').searchParams.has('start')).toBe(false);
        expect(requestUrls).toHaveLength(1);
        expect(fixed.range).toEqual({ startDate: range.start, endDate: range.end });
        diagnostics();
      } finally {
        await context.close();
      }
    }
  });
});
