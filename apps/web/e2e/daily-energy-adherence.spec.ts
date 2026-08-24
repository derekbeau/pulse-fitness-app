import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type { DailyEnergyAdherence } from '@pulse/shared';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { apiBaseURL } from './test-env';

// The fixture program is America/Detroit. Keeping the browser on the opposite side of the
// international date line proves that Nutrition Log selection is program-local.
test.use({ timezoneId: 'Pacific/Kiritimati' });

const username = 'adaptive-preview-de-adherence';
const password = 'adaptive-preview-only';
let fixtureDate = '';
let api: APIRequestContext;
let token: string;
let agentToken: { id: string; token: string };
const deterministicFixtureDate = '2026-08-23';

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

function monitorPage(
  page: Page,
  expectedResponses: Array<{ path: string; status: number }> = [],
  expectedRequestFailures: Array<{ errorText: string; method: string; path: string }> = [],
) {
  const failures: string[] = [];
  const failedResourceConsoleMessages: string[] = [];
  let expectedFailedResourceMessages = 0;
  const expectedRequestFailureCounts = new Map(
    expectedRequestFailures.map((expected) => [JSON.stringify(expected), 0]),
  );
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      const value = `${message.type()}: ${message.text()}`;
      if (
        message.type() === 'error' &&
        expectedResponses.length > 0 &&
        /^error: Failed to load resource: the server responded with a status of \d+ \(.+\)$/u.test(
          value,
        )
      ) {
        failedResourceConsoleMessages.push(value);
      } else {
        failures.push(value);
      }
    }
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (failed) => {
    const errorText = failed.failure()?.errorText ?? '';
    const path = new URL(failed.url()).pathname;
    const expected = expectedRequestFailures.find(
      (candidate) =>
        candidate.errorText === errorText &&
        candidate.method === failed.method() &&
        candidate.path === path,
    );
    if (expected) {
      const key = JSON.stringify(expected);
      expectedRequestFailureCounts.set(key, (expectedRequestFailureCounts.get(key) ?? 0) + 1);
      return;
    }
    failures.push(`requestfailed: ${failed.method()} ${failed.url()} ${errorText}`);
  });
  page.on('response', (response) => {
    const expectedFailure =
      response.status() >= 400 &&
      expectedResponses.some(
        (expected) =>
          response.status() === expected.status &&
          new URL(response.url()).pathname === expected.path,
      );
    if (expectedFailure) {
      expectedFailedResourceMessages += 1;
    } else if (response.status() >= 400) {
      failures.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  return () => {
    for (const expected of expectedRequestFailures) {
      const count = expectedRequestFailureCounts.get(JSON.stringify(expected)) ?? 0;
      if (count !== 1)
        failures.push(`expected request failure count ${count}: ${JSON.stringify(expected)}`);
    }
    expect(
      failures.concat(failedResourceConsoleMessages.slice(expectedFailedResourceMessages)),
      'browser diagnostics',
    ).toEqual([]);
  };
}

async function capture(page: Page, filename: string) {
  const directory = resolve(process.cwd(), '../../artifacts/issue-114');
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ fullPage: true, path: resolve(directory, filename) });
}

async function openNutrition(page: Page, date: string, sessionToken = token) {
  await setAuthenticatedSession(page, sessionToken);
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
  for (let attempts = 0; attempts < 5 && (await button.count()) === 0; attempts += 1) {
    const firstDateButton = page.getByRole('button', { name: /^Select /u }).first();
    await expect(firstDateButton).toBeVisible();
    const visibleDateLabels = await page
      .getByRole('button', { name: /^Select /u })
      .allTextContents();
    const firstVisible = await firstDateButton.getAttribute('aria-label');
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
  }
  await expect(button).toBeVisible();
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

    const currentDate = dateKeyInDetroit();
    fixtureDate = deterministicFixtureDate;
    expect(currentDate, 'deterministic program-local browser date').toBe(
      addDays(deterministicFixtureDate, 1),
    );
    const fixtureStates = await Promise.all(
      [1, 2, 3, 4].map(async (distance) => {
        const response = await api.get(
          `/api/v1/nutrition/${addDays(fixtureDate, -distance)}/energy-adherence`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        expect(response.ok(), await response.text()).toBeTruthy();
        return ((await response.json()) as { data: DailyEnergyAdherence }).data.dataState;
      }),
    );
    expect(fixtureStates).toEqual(['gradeable', 'partial', 'unknown', 'missing']);

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
    const completeDate = addDays(fixtureDate, -1);
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
    const provenance = card.getByText('Accepted-fact provenance');
    await provenance.focus();
    await page.keyboard.press('Enter');
    await expect(card.getByRole('region', { name: 'Target provenance' })).toContainText(
      'Accepted adaptive recommendation',
    );
    await expect(card.getByRole('region', { name: 'Target provenance' })).toContainText(
      'Accepted check-in ID',
    );
    await expect(card.getByRole('region', { name: 'Expenditure provenance' })).toContainText(
      'Accepted adaptive check-in',
    );

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

    for (const width of [320, 390, 430, 768, 1280]) {
      await expectNoOverflow(page, width);
      await expect(card.getByText('On target')).toBeVisible();
      await expect(provenance).toBeVisible();
    }
    await page.setViewportSize({ height: 1000, width: 390 });
    await capture(page, 'daily-energy-on-target-390.png');
    await page.setViewportSize({ height: 1000, width: 1280 });
    await capture(page, 'daily-energy-on-target-1280.png');

    for (const theme of ['dark', 'light', 'midnight'] as const) {
      await page.evaluate((value) => window.localStorage.setItem('pulse-theme', value), theme);
      const refreshed = page.waitForResponse(
        (candidate) =>
          candidate.url().endsWith(`/api/v1/nutrition/${today}/energy-adherence`) &&
          candidate.status() === 200,
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await refreshed;
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html')).toHaveClass(
        theme === 'dark'
          ? /dark/u
          : theme === 'midnight'
            ? /theme-midnight/u
            : /^((?!dark|theme-midnight).)*$/u,
      );
    }
    diagnostics();
  });

  test('keeps partial, unknown, missing, and cutoff days ungraded', async ({ page }) => {
    const diagnostics = monitorPage(page);
    const today = dateKeyInDetroit();
    await page.setViewportSize({ height: 1000, width: 320 });
    await openNutrition(page, today);
    const cases = [
      { date: addDays(fixtureDate, -2), title: 'Partial log' },
      { date: addDays(fixtureDate, -3), title: 'Completeness unknown' },
      { date: addDays(fixtureDate, -4), title: 'No nutrition log' },
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

  test('renders exact symmetric tolerance boundaries without goal-direction bias', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ height: 1000, width: 430 });
    await openNutrition(page, dateKeyInDetroit());
    const cases = [
      { offset: -5, difference: 125, adherence: 'on_target', label: 'On target' },
      { offset: -6, difference: 126, adherence: 'near_target', label: 'Near target' },
      { offset: -7, difference: 250, adherence: 'near_target', label: 'Near target' },
      { offset: -8, difference: 251, adherence: 'off_target', label: 'Outside target range' },
      { offset: -9, difference: -125, adherence: 'on_target', label: 'On target' },
      { offset: -10, difference: -250, adherence: 'near_target', label: 'Near target' },
      { offset: -11, difference: -251, adherence: 'off_target', label: 'Outside target range' },
    ] as const;
    for (const boundary of cases) {
      const date = addDays(fixtureDate, boundary.offset);
      await selectDate(page, date);
      const response = await api.get(`/api/v1/nutrition/${date}/energy-adherence`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const fact = ((await response.json()) as { data: DailyEnergyAdherence }).data;
      expect(fact).toMatchObject({
        adherence: boundary.adherence,
        intakeMinusTargetKcal: boundary.difference,
        innerToleranceKcal: 125,
        outerToleranceKcal: 250,
      });
      await expect(
        page.getByRole('article', { name: 'Daily energy' }).getByText(boundary.label),
      ).toBeVisible();
    }
    await capture(page, 'daily-energy-boundaries-430.png');
    diagnostics();
  });

  test('keeps gain and loss grading identical and shows manual pre-program provenance', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    for (const [suffix, goalType] of [
      ['de-loss', 'lose'],
      ['de-gain', 'gain'],
    ] as const) {
      const login = await api.post('/api/v1/auth/login', {
        data: { password, username: `adaptive-preview-${suffix}` },
      });
      expect(login.ok(), await login.text()).toBeTruthy();
      const fixtureToken = ((await login.json()) as { data: { token: string } }).data.token;
      const state = await api.get('/api/v1/adaptive-nutrition', {
        headers: { authorization: `Bearer ${fixtureToken}` },
      });
      expect(state.ok(), await state.text()).toBeTruthy();
      expect(
        ((await state.json()) as { data: { program: { goalType: string } } }).data.program.goalType,
      ).toBe(goalType);
      const date = addDays(fixtureDate, -1);
      await openNutrition(page, dateKeyInDetroit(), fixtureToken);
      await selectDate(page, date);
      await expect(page.getByRole('article', { name: 'Daily energy' })).toContainText('On target');
    }

    const manualLogin = await api.post('/api/v1/auth/login', {
      data: { password, username: 'adaptive-preview-de-manual' },
    });
    expect(manualLogin.ok(), await manualLogin.text()).toBeTruthy();
    const manualToken = ((await manualLogin.json()) as { data: { token: string } }).data.token;
    const preProgramDate = addDays(fixtureDate, -8);
    await openNutrition(page, dateKeyInDetroit(), manualToken);
    await selectDate(page, preProgramDate);
    const card = page.getByRole('article', { name: 'Daily energy' });
    await card.getByText('Accepted-fact provenance').click();
    await expect(card.getByRole('region', { name: 'Target provenance' })).toContainText(
      'Manual target',
    );
    await expect(card.getByRole('region', { name: 'Expenditure provenance' })).toContainText(
      'No accepted expenditure',
    );
    const manualFactResponse = await api.get(
      `/api/v1/nutrition/${preProgramDate}/energy-adherence`,
      { headers: { authorization: `Bearer ${manualToken}` } },
    );
    expect(manualFactResponse.ok(), await manualFactResponse.text()).toBeTruthy();
    expect(
      ((await manualFactResponse.json()) as { data: DailyEnergyAdherence }).data,
    ).toMatchObject({ target: { source: 'manual' }, expenditure: null });
    await expectNoOverflow(page, 768);
    await capture(page, 'daily-energy-manual-gap-768.png');
    diagnostics();
  });

  test('switches accepted revisions by effective date and excludes a competing pending proposal', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    const login = await api.post('/api/v1/auth/login', {
      data: { password, username: 'adaptive-preview-de-revisions' },
    });
    expect(login.ok(), await login.text()).toBeTruthy();
    const revisionToken = ((await login.json()) as { data: { token: string } }).data.token;
    const dates = [addDays(fixtureDate, -8), addDays(fixtureDate, -6), addDays(fixtureDate, -3)];
    const facts: DailyEnergyAdherence[] = [];
    for (const date of dates) {
      const response = await api.get(`/api/v1/nutrition/${date}/energy-adherence`, {
        headers: { authorization: `Bearer ${revisionToken}` },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      facts.push(((await response.json()) as { data: DailyEnergyAdherence }).data);
    }
    expect(facts[0]?.expenditure?.checkInId).not.toBe(facts[1]?.expenditure?.checkInId);
    expect(facts[1]?.expenditure).toEqual(facts[2]?.expenditure);
    expect(facts[2]?.expenditure?.caloriesKcal).not.toBe(4_100);

    await openNutrition(page, dateKeyInDetroit(), revisionToken);
    await selectDate(page, dates[2] ?? '');
    const card = page.getByRole('article', { name: 'Daily energy' });
    await card.getByText('Accepted-fact provenance').click();
    await expect(card.getByRole('region', { name: 'Expenditure provenance' })).toContainText(
      facts[2]?.expenditure?.checkInId ?? '',
    );
    await expect(card).not.toContainText('4100 kcal');
    diagnostics();
  });

  test('rolls a continuously visible opposite-zone browser at program-local midnight', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    const beforeMidnight = new Date('2026-08-24T03:59:50.000Z');
    await page.clock.install({ time: beforeMidnight });
    await openNutrition(page, '2026-08-23');
    await expect(page.getByRole('article', { name: 'Daily energy' })).toContainText(
      'Accepted facts for 2026-08-23',
    );

    await page.clock.fastForward(11_000);
    await expect(page.getByRole('article', { name: 'Daily energy' })).toContainText(
      'Accepted facts for 2026-08-24',
    );
    await expect(page.locator('button').filter({ hasText: /^Today$/u })).toHaveClass(/invisible/u);
    await expectNoOverflow(page, 320);
    diagnostics();
  });

  test('recomputes a corrected meal while keeping target and expenditure provenance unchanged', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    const date = addDays(fixtureDate, -5);
    const dailyResponse = await api.get(`/api/v1/nutrition/${date}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(dailyResponse.ok(), await dailyResponse.text()).toBeTruthy();
    const daily = (await dailyResponse.json()) as {
      data: {
        meals: Array<{ meal: { id: string }; items: Array<{ id: string; calories: number }> }>;
      };
    };
    const meal = daily.data.meals[0];
    const item = meal?.items[0];
    if (!meal || !item) throw new Error('Daily Energy correction fixture is missing');
    const before = await api.get(`/api/v1/nutrition/${date}/energy-adherence`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const beforeFact = ((await before.json()) as { data: DailyEnergyAdherence }).data;
    try {
      const corrected = await api.patch(
        `/api/v1/nutrition/${date}/meals/${meal.meal.id}/items/${item.id}`,
        {
          data: { calories: item.calories + 75 },
          headers: { authorization: `Bearer ${token}` },
        },
      );
      expect(corrected.ok(), await corrected.text()).toBeTruthy();
      await openNutrition(page, dateKeyInDetroit());
      await selectDate(page, date);
      const after = await api.get(`/api/v1/nutrition/${date}/energy-adherence`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const afterFact = ((await after.json()) as { data: DailyEnergyAdherence }).data;
      expect(afterFact.nutrition.intakeKcal).toBe(beforeFact.nutrition.intakeKcal + 75);
      expect(afterFact.target).toEqual(beforeFact.target);
      expect(afterFact.expenditure).toEqual(beforeFact.expenditure);
      await expect(page.getByRole('article', { name: 'Daily energy' })).toContainText(
        `${afterFact.nutrition.intakeKcal} kcal`,
      );
    } finally {
      const restored = await api.patch(
        `/api/v1/nutrition/${date}/meals/${meal.meal.id}/items/${item.id}`,
        {
          data: { calories: item.calories },
          headers: { authorization: `Bearer ${token}` },
        },
      );
      expect(restored.ok(), await restored.text()).toBeTruthy();
      const restoredStatus = await api.patch(`/api/v1/nutrition/${date}/status`, {
        data: { status: 'complete' },
        headers: { authorization: `Bearer ${token}` },
      });
      expect(restoredStatus.ok(), await restoredStatus.text()).toBeTruthy();
    }
    diagnostics();
  });

  test('keeps loading and rapid date changes scoped to the selected day', async ({ page }) => {
    const today = dateKeyInDetroit();
    const slowDate = addDays(fixtureDate, -2);
    const selectedDate = addDays(fixtureDate, -1);
    const diagnostics = monitorPage(
      page,
      [],
      [
        {
          errorText: 'net::ERR_ABORTED',
          method: 'GET',
          path: `/api/v1/nutrition/${slowDate}/energy-adherence`,
        },
      ],
    );
    let releaseInitial: () => void = () => {};
    const initialRelease = new Promise<void>((resolveRelease) => {
      releaseInitial = resolveRelease;
    });
    let announceInitial: () => void = () => {};
    const initialStarted = new Promise<void>((resolveStarted) => {
      announceInitial = resolveStarted;
    });
    await page.route(`**/api/v1/nutrition/${today}/energy-adherence`, async (route) => {
      announceInitial();
      await initialRelease;
      await route.continue();
    });
    await setAuthenticatedSession(page, token);
    const initialResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/nutrition/${today}/energy-adherence`) &&
        response.status() === 200,
    );
    await page.goto('/nutrition?view=log', { waitUntil: 'domcontentloaded' });
    await initialStarted;
    await expect(page.getByRole('status', { name: 'Loading daily energy' })).toBeVisible();
    releaseInitial();
    await initialResponse;
    await expect(page.getByRole('article', { name: 'Daily energy' })).toContainText(
      `Accepted facts for ${today}`,
    );
    await page.unroute(`**/api/v1/nutrition/${today}/energy-adherence`);

    await page.getByRole('button', { name: 'Go to previous week' }).click();
    await expect(page.getByRole('button', { name: `Select ${slowDate}` })).toBeVisible();
    let releaseSlow: () => void = () => {};
    const slowRelease = new Promise<void>((resolveRelease) => {
      releaseSlow = resolveRelease;
    });
    let announceSlow: () => void = () => {};
    const slowStarted = new Promise<void>((resolveStarted) => {
      announceSlow = resolveStarted;
    });
    await page.route(`**/api/v1/nutrition/${slowDate}/energy-adherence`, async (route) => {
      announceSlow();
      await slowRelease;
      await route.continue();
    });
    const slowResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/nutrition/${slowDate}/energy-adherence`) &&
        response.status() === 200,
    );
    await page.getByRole('button', { name: `Select ${slowDate}` }).click();
    await slowStarted;
    const selectedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/nutrition/${selectedDate}/energy-adherence`) &&
        response.status() === 200,
    );
    await page.getByRole('button', { name: `Select ${selectedDate}` }).click();
    await selectedResponse;
    await expect(page.getByRole('article', { name: 'Daily energy' })).toContainText(
      `Accepted facts for ${selectedDate}`,
    );
    releaseSlow();
    await slowResponse;
    await expect(page.getByRole('article', { name: 'Daily energy' })).toContainText(
      `Accepted facts for ${selectedDate}`,
    );
    await page.unroute(`**/api/v1/nutrition/${slowDate}/energy-adherence`);
    await page.waitForLoadState('networkidle');
    diagnostics();
  });

  test('shows an initial error with scoped retry without changing accepted facts', async ({
    page,
  }) => {
    test.setTimeout(70_000);
    const today = dateKeyInDetroit();
    const path = `/api/v1/nutrition/${today}/energy-adherence`;
    const diagnostics = monitorPage(page, [{ path, status: 503 }]);
    let responseMode: 'background-error' | 'initial-error' | 'success' = 'initial-error';
    let backgroundRequestSeen = false;
    let announceBackgroundStarted: () => void = () => {};
    let releaseBackground: () => void = () => {};
    const backgroundStarted = new Promise<void>((resolveStarted) => {
      announceBackgroundStarted = resolveStarted;
    });
    const backgroundRelease = new Promise<void>((resolveRelease) => {
      releaseBackground = resolveRelease;
    });
    await page.route(/\/api\/v1\/nutrition\/[^/]+\/energy-adherence$/u, async (route) => {
      if (new URL(route.request().url()).pathname !== path) {
        await route.continue();
        return;
      }
      if (responseMode !== 'success') {
        if (responseMode === 'background-error' && !backgroundRequestSeen) {
          backgroundRequestSeen = true;
          announceBackgroundStarted();
          await backgroundRelease;
        }
        await route.fulfill({
          body: JSON.stringify({ error: { code: 'TEMPORARY', message: 'Temporary failure' } }),
          contentType: 'application/json',
          status: 503,
        });
        return;
      }
      await route.continue();
    });
    await setAuthenticatedSession(page, token);
    await page.goto('/nutrition?view=log', { waitUntil: 'domcontentloaded' });
    const alert = page.getByRole('alert').filter({ hasText: 'Daily energy could not be loaded' });
    await expect(alert).toBeVisible();
    responseMode = 'success';
    const retryResponse = page.waitForResponse(
      (candidate) => candidate.url().endsWith(path) && candidate.status() === 200,
    );
    await alert.getByRole('button', { name: 'Retry daily energy' }).click();
    await retryResponse;
    const card = page.getByRole('article', { name: 'Daily energy' });
    await expect(card).toBeVisible();
    responseMode = 'background-error';
    await backgroundStarted;
    await expect(card.getByRole('status')).toContainText('Refreshing accepted facts');
    releaseBackground();
    await expect(card.getByRole('alert')).toContainText(
      'accepted facts shown here may be out of date',
    );
    await expect(card).toContainText('Waiting for day cutoff');
    responseMode = 'success';
    const recovered = page.waitForResponse(
      (candidate) => candidate.url().endsWith(path) && candidate.status() === 200,
    );
    await card.getByRole('button', { name: 'Retry refresh' }).click();
    await recovered;
    await expect(card.getByRole('alert')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    diagnostics();
  });
});
