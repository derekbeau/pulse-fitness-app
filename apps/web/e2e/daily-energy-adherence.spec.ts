import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type { DailyEnergyAdherence } from '@pulse/shared';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'America/Detroit' });

const username = 'adaptive-preview-de-adherence';
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
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
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

async function capture(page: Page, filename: string) {
  const directory = resolve(process.cwd(), '../../artifacts/issue-114');
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ fullPage: true, path: resolve(directory, filename) });
}

async function openNutrition(page: Page, date: string) {
  await setAuthenticatedSession(page, token);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(`/api/v1/nutrition/${date}/energy-adherence`) &&
      candidate.status() === 200,
  );
  await page.goto('/nutrition?view=log', { waitUntil: 'domcontentloaded' });
  const payload = (await (await response).json()) as { data: DailyEnergyAdherence };
  await expect(page.getByRole('heading', { level: 1, name: 'Nutrition' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Daily energy' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  return payload.data;
}

async function selectDate(page: Page, date: string) {
  let button = page.getByRole('button', { name: `Select ${date}` });
  if ((await button.count()) === 0) {
    const visibleDateLabels = await page
      .getByRole('button', { name: /^Select /u })
      .allTextContents();
    const firstVisible = await page
      .getByRole('button', { name: /^Select /u })
      .first()
      .getAttribute('aria-label');
    if (!firstVisible || visibleDateLabels.length === 0) {
      throw new Error('Nutrition week dates are unavailable');
    }
    const firstDate = firstVisible.replace('Select ', '');
    await page
      .getByRole('button', {
        name: date < firstDate ? 'Go to previous week' : 'Go to next week',
      })
      .click();
    button = page.getByRole('button', { name: `Select ${date}` });
    await expect(button).toBeVisible();
  }
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('data-selected', 'true');
  await expect(page.getByRole('article', { name: 'Daily energy' })).toContainText(
    `Accepted facts for ${date}`,
  );
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
  for (const button of await page.getByRole('button', { name: /^Select /u }).all()) {
    const box = await button.boundingBox();
    if (!box || box.x + box.width <= 0 || box.x >= width) continue;
    expect(box.height, `${width}px selected-day touch target`).toBeGreaterThanOrEqual(44);
  }
}

test.describe.serial('Daily energy adherence', () => {
  test.beforeAll(async () => {
    api = await request.newContext({ baseURL: apiBaseURL });
    const login = await api.post('/api/v1/auth/login', { data: { password, username } });
    expect(login.ok(), await login.text()).toBeTruthy();
    token = ((await login.json()) as { data: { token: string } }).data.token;
    const created = await api.post('/api/v1/agent-tokens', {
      data: { name: 'Daily energy browser parity' },
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

  test('renders accepted historical facts and exact AgentToken parity', async ({ page }) => {
    const diagnostics = monitorPage(page);
    const today = dateKeyInDetroit();
    const completeDate = addDays(today, -1);
    await page.setViewportSize({ height: 1000, width: 390 });
    const current = await openNutrition(page, today);
    expect(current).toMatchObject({
      localDate: today,
      dataState: 'pending_cutoff',
      adherence: null,
    });
    await expect(page.getByText('Waiting for day cutoff')).toBeVisible();

    await selectDate(page, completeDate);
    const card = page.getByRole('article', { name: 'Daily energy' });
    await expect(card.getByText('On target')).toBeVisible();
    await expect(card.getByText('2400 kcal')).toBeVisible();
    await expect(card.getByText('2500 kcal')).toHaveCount(3);
    await expect(card.getByText('−100 kcal')).toHaveCount(2);
    await expect(card.getByText(/same distance above or below/)).toBeVisible();
    await expect(card.getByText(/Exercise calories are not credited here/)).toBeVisible();
    await expect(card.getByText(/accepted check-in effective/, { exact: false })).toBeVisible();

    const url = `/api/v1/nutrition/${completeDate}/energy-adherence`;
    const [jwtResponse, agentResponse] = await Promise.all([
      api.get(url, { headers: { authorization: `Bearer ${token}` } }),
      api.get(url, { headers: { authorization: `AgentToken ${agentToken.token}` } }),
    ]);
    expect(jwtResponse.ok(), await jwtResponse.text()).toBeTruthy();
    expect(agentResponse.ok(), await agentResponse.text()).toBeTruthy();
    const jwtPayload = (await jwtResponse.json()) as { data: DailyEnergyAdherence };
    const agentPayload = (await agentResponse.json()) as { data: DailyEnergyAdherence };
    expect(agentPayload.data).toEqual(jwtPayload.data);
    expect(jwtPayload.data).toMatchObject({
      localDate: completeDate,
      dataState: 'gradeable',
      adherence: 'on_target',
      intakeMinusTargetKcal: -100,
      intakeMinusExpenditureKcal: -100,
      target: { caloriesKcal: 2_500 },
      expenditure: { caloriesKcal: 2_500, source: 'accepted_check_in' },
    });

    await expectNoOverflow(page, 390);
    await capture(page, 'daily-energy-on-target-390.png');
    await expectNoOverflow(page, 1280);
    await capture(page, 'daily-energy-on-target-1280.png');
    diagnostics();
  });

  test('keeps partial, unknown, missing, and cutoff days ungraded', async ({ page }) => {
    const diagnostics = monitorPage(page);
    const today = dateKeyInDetroit();
    await page.setViewportSize({ height: 1000, width: 320 });
    await openNutrition(page, today);
    const cases = [
      { date: addDays(today, -2), title: 'Partial log' },
      { date: addDays(today, -3), title: 'Completeness unknown' },
      { date: addDays(today, -4), title: 'No nutrition log' },
    ];
    for (const value of cases) {
      await selectDate(page, value.date);
      const card = page.getByRole('article', { name: 'Daily energy' });
      await expect(card.getByText(value.title)).toBeVisible();
      await expect(card.getByRole('img', { name: /Energy adherence:/u })).toHaveCount(0);
    }
    await capture(page, 'daily-energy-incomplete-320.png');

    await selectDate(page, today);
    await expect(page.getByText('Waiting for day cutoff')).toBeVisible();
    await expect(page.getByRole('img', { name: /Energy adherence:/u })).toHaveCount(0);
    for (const width of [320, 430, 768]) await expectNoOverflow(page, width);
    await page.waitForLoadState('networkidle');
    diagnostics();
  });
});
