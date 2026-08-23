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
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    `${width}px page overflow`,
  ).toBe(true);
  const domainGroup = page.getByRole('group', { name: 'Calendar domains' });
  for (const control of await domainGroup.getByRole('button').all()) {
    const box = await control.boundingBox();
    expect(
      box?.height ?? 0,
      `${width}px ${await control.textContent()} touch target`,
    ).toBeGreaterThanOrEqual(44);
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
    const today = calendar.days.find((day) => day.isToday)?.date ?? dateKeyInDetroit();
    const contextDate = addDays(today, -4);
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

  test('keeps missing, cutoff, corrected, planned, and completed evidence distinct', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ height: 1000, width: 430 });
    const calendar = await openCalendar(page);
    const today = calendar.days.find((day) => day.isToday)?.date ?? dateKeyInDetroit();

    await selectDay(page, addDays(today, -3));
    await expect(page.getByText('Retained row was corrected')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Weight' }).getByText('Corrected', { exact: true }),
    ).toBeVisible();

    await selectDay(page, addDays(today, -2));
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

    await selectDay(page, addDays(today, -1));
    await expect(page.getByText('Cross-domain strength session')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Workout' }).getByText('corrected', { exact: true }).first(),
    ).toBeVisible();
    await capture(page, 'data-quality-workout-430.png');

    await selectDay(page, today);
    await expect(
      page
        .getByRole('region', { name: 'Nutrition' })
        .getByText('Pending cutoff', { exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Weight' })
        .getByText('Pending cutoff', { exact: true })
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
    for (const width of [768, 1280]) {
      await page.setViewportSize({ height: 1000, width });
      await expectNoOverflowAndTouchTargets(page, width);
      await capture(page, `data-quality-calendar-${width}.png`);
    }
    diagnostics();
  });
});
