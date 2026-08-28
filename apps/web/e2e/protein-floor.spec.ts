import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type { DailyEnergyAdherence, DashboardSnapshot } from '@pulse/shared';
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { adaptivePreviewFixtureContract } from './adaptive-preview-fixture-contract';
import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'Pacific/Kiritimati' });
test.describe.configure({ mode: 'serial' });

const username = 'adaptive-preview-protein-floor';
const password = 'adaptive-preview-only';
const fixtureDate = adaptivePreviewFixtureContract.anchorDate;
let api: APIRequestContext;
let token = '';
let unavailableToken = '';
let agentToken: { id: string; token: string } | undefined;

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function snapshotWithProtein(
  snapshot: DashboardSnapshot,
  date: string,
  actualProteinGrams: number,
): DashboardSnapshot {
  const proteinFloorGrams = snapshot.macros.proteinFloor.proteinFloorGrams ?? 160;
  const remainingToFloorGrams = Math.max(proteinFloorGrams - actualProteinGrams, 0);
  const amountAboveFloorGrams = Math.max(actualProteinGrams - proteinFloorGrams, 0);

  return {
    ...snapshot,
    date,
    weight: null,
    workout: null,
    macros: {
      ...snapshot.macros,
      actual: { ...snapshot.macros.actual, protein: actualProteinGrams },
      target: { ...snapshot.macros.target, protein: proteinFloorGrams },
      proteinFloor: {
        actualProteinGrams,
        proteinFloorGrams,
        remainingToFloorGrams,
        amountAboveFloorGrams,
        state: remainingToFloorGrams > 0 ? 'below_floor' : 'floor_met',
        isFinal: true,
      },
    },
  };
}

async function selectDashboardDate(page: Page, date: string) {
  await page.getByRole('button', { name: 'Change date' }).click();
  await page.locator(`[data-slot="calendar-day"][data-date="${date}"]`).click();
}

function monitorPage(
  page: Page,
  expectedResponses: string[] = [],
  expectedConsoleErrors: string[] = [],
  expectedRequestFailures: string[] = [],
  allowedRequestFailures: string[] = [],
) {
  const failures: string[] = [];
  const remainingExpectedResponses = [...expectedResponses];
  const remainingExpectedConsoleErrors = [...expectedConsoleErrors];
  const remainingExpectedRequestFailures = [...expectedRequestFailures];
  const allowedRequestFailureSet = new Set(allowedRequestFailures);
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      const expectedIndex = remainingExpectedConsoleErrors.indexOf(message.text());
      if (expectedIndex >= 0) {
        remainingExpectedConsoleErrors.splice(expectedIndex, 1);
        return;
      }
      failures.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (failed) => {
    const signature = `${failed.method()} ${new URL(failed.url()).pathname}${new URL(failed.url()).search} ${failed.failure()?.errorText ?? ''}`;
    const expectedIndex = remainingExpectedRequestFailures.indexOf(signature);
    if (expectedIndex >= 0) {
      remainingExpectedRequestFailures.splice(expectedIndex, 1);
      return;
    }
    if (allowedRequestFailureSet.delete(signature)) return;
    failures.push(`requestfailed: ${signature}`);
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const signature = `${response.request().method()} ${new URL(response.url()).pathname} ${response.status()}`;
    const expectedIndex = remainingExpectedResponses.indexOf(signature);
    if (expectedIndex >= 0) {
      remainingExpectedResponses.splice(expectedIndex, 1);
      return;
    }
    failures.push(`http ${response.status()}: ${response.url()}`);
  });
  return () => {
    expect(remainingExpectedResponses, 'expected browser responses').toEqual([]);
    expect(remainingExpectedConsoleErrors, 'expected browser console errors').toEqual([]);
    expect(remainingExpectedRequestFailures, 'expected browser request failures').toEqual([]);
    expect(failures, 'browser diagnostics').toEqual([]);
  };
}

async function capture(page: Page, filename: string) {
  const directory = resolve(process.cwd(), '../../artifacts/issue-118');
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ fullPage: true, path: resolve(directory, filename) });
}

async function setTheme(page: Page, theme: 'light' | 'dark' | 'midnight') {
  await page.evaluate((value) => window.localStorage.setItem('pulse-theme', value), theme);
  await page.reload({ waitUntil: 'networkidle' });
  const rootClass = (await page.locator('html').getAttribute('class')) ?? '';
  expect(rootClass.includes('dark'), `${theme} dark class`).toBe(theme === 'dark');
  expect(rootClass.includes('theme-midnight'), `${theme} midnight class`).toBe(
    theme === 'midnight',
  );
}

async function openNutrition(page: Page, date: string) {
  await setAuthenticatedSession(page, token);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(`/api/v1/nutrition/${date}/energy-adherence`) &&
      candidate.status() === 200,
  );
  await page.goto(`/nutrition?view=log&date=${date}`, { waitUntil: 'domcontentloaded' });
  const payload = (await (await response).json()) as { data: DailyEnergyAdherence };
  await expect(page.getByRole('heading', { level: 1, name: 'Nutrition' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Macro progress' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  return payload.data;
}

function proteinCard(page: Page) {
  return page.getByRole('heading', { level: 3, name: 'Protein' }).locator('..');
}

async function expectNoOverflow(page: Page, width: number, card?: Locator) {
  await page.setViewportSize({ width, height: 1000 });
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    `${width}px document overflow`,
  ).toBe(true);
  const inspectedCard = card ?? proteinCard(page);
  expect(
    await inspectedCard.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  if (!card) {
    const ringBox = await inspectedCard.getByRole('progressbar').boundingBox();
    const headingBox = await inspectedCard.getByRole('heading', { name: 'Protein' }).boundingBox();
    expect(ringBox, `${width}px protein ring geometry`).not.toBeNull();
    expect(headingBox, `${width}px protein heading geometry`).not.toBeNull();
    expect(
      (ringBox?.y ?? 0) + (ringBox?.height ?? 0) <= (headingBox?.y ?? 0) + 1,
      `${width}px ring and label overlap`,
    ).toBe(true);
    for (const name of ['Eaten', 'Remaining']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box?.height, `${name} touch target`).toBeGreaterThanOrEqual(44);
      expect(box?.width, `${name} touch target`).toBeGreaterThanOrEqual(44);
    }
  }
}

test.describe('Protein minimum floor', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(adaptivePreviewFixtureContract.serverNow));
  });

  test.beforeAll(async () => {
    api = await request.newContext({ baseURL: apiBaseURL });
    const login = await api.post('/api/v1/auth/login', { data: { password, username } });
    expect(login.ok(), await login.text()).toBeTruthy();
    token = ((await login.json()) as { data: { token: string } }).data.token;
    const unavailableLogin = await api.post('/api/v1/auth/login', {
      data: { password, username: 'adaptive-preview-protein-none' },
    });
    expect(unavailableLogin.ok(), await unavailableLogin.text()).toBeTruthy();
    unavailableToken = ((await unavailableLogin.json()) as { data: { token: string } }).data.token;
    const created = await api.post('/api/v1/agent-tokens', {
      data: { name: 'Protein floor browser parity' },
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

  test('renders below, met, and unavailable facts without an over-target warning', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    const partialDate = addDays(fixtureDate, -2);
    const aboveDate = addDays(fixtureDate, -1);
    const futureDate = addDays(fixtureDate, 1);

    await page.setViewportSize({ width: 320, height: 1000 });
    const partial = await openNutrition(page, partialDate);
    await setTheme(page, 'light');
    expect(partial.proteinFloor).toMatchObject({
      actualProteinGrams: 140,
      proteinFloorGrams: 160,
      remainingToFloorGrams: 20,
      state: 'below_floor',
      isFinal: false,
    });
    await expect(proteinCard(page)).toContainText('140g');
    await expect(proteinCard(page)).toContainText('20g to minimum');
    await expect(proteinCard(page)).toContainText('Based on food logged so far');
    await expectNoOverflow(page, 320);
    await capture(page, 'protein-floor-below-320-light.png');

    await openNutrition(page, aboveDate);
    await setTheme(page, 'midnight');
    await expect(proteinCard(page)).toContainText('200g');
    await expect(proteinCard(page)).toContainText('Minimum met');
    await expect(proteinCard(page)).not.toContainText(/over target|too much|failure/i);
    await expectNoOverflow(page, 430);
    await capture(page, 'protein-floor-above-430-midnight.png');

    await openNutrition(page, futureDate);
    await expect(proteinCard(page)).toContainText('Protein minimum unavailable');
    await expect(proteinCard(page)).toContainText('220g logged');
    await expect(proteinCard(page)).not.toContainText('Minimum met');
    await expectNoOverflow(page, 768);
    await capture(page, 'protein-floor-unavailable-768.png');
    diagnostics();
  });

  test('keeps complete current facts final across Nutrition, Dashboard, and AgentToken', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ width: 390, height: 1000 });
    const current = await openNutrition(page, fixtureDate);
    await setTheme(page, 'dark');
    expect(current.proteinFloor).toEqual({
      actualProteinGrams: 160,
      proteinFloorGrams: 160,
      remainingToFloorGrams: 0,
      amountAboveFloorGrams: 0,
      state: 'floor_met',
      isFinal: true,
    });
    await expect(proteinCard(page)).toContainText('Minimum met');
    await expect(proteinCard(page)).not.toContainText('Based on food logged so far');
    await expect(
      page.getByRole('progressbar', {
        name: `${fixtureDate}: 160g protein logged; minimum 160g; Minimum met`,
      }),
    ).toHaveAttribute('aria-valuetext', 'Minimum met');
    await page.getByRole('button', { name: 'Remaining' }).focus();
    await expect(page.getByRole('button', { name: 'Remaining' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Remaining' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Eaten' }).focus();
    await expect(page.getByRole('button', { name: 'Eaten' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Eaten' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(proteinCard(page)).toContainText('160g');
    await expect(proteinCard(page)).toContainText('Minimum met');
    await expectNoOverflow(page, 390);
    await capture(page, 'protein-floor-exact-390-dark.png');

    const [jwtResponse, agentResponse] = await Promise.all([
      api.get(`/api/v1/nutrition/${fixtureDate}/energy-adherence`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      api.get(`/api/v1/nutrition/${fixtureDate}/energy-adherence`, {
        headers: { authorization: `AgentToken ${agentToken?.token ?? ''}` },
      }),
    ]);
    expect(jwtResponse.ok(), await jwtResponse.text()).toBeTruthy();
    expect(agentResponse.ok(), await agentResponse.text()).toBeTruthy();
    const jwtDailyEnergy = ((await jwtResponse.json()) as { data: DailyEnergyAdherence }).data;
    const agentDailyEnergy = ((await agentResponse.json()) as { data: DailyEnergyAdherence }).data;
    expect(agentDailyEnergy).toEqual(jwtDailyEnergy);

    const [dashboardResponse, contextResponse] = await Promise.all([
      api.get(`/api/v1/dashboard/snapshot?date=${fixtureDate}`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      api.get('/api/v1/context', {
        headers: { authorization: `AgentToken ${agentToken?.token ?? ''}` },
      }),
    ]);
    expect(dashboardResponse.ok(), await dashboardResponse.text()).toBeTruthy();
    expect(contextResponse.ok(), await contextResponse.text()).toBeTruthy();
    const dashboardData = (await dashboardResponse.json()) as {
      data: { macros: { proteinFloor: DailyEnergyAdherence['proteinFloor'] } };
    };
    const contextData = (await contextResponse.json()) as {
      data: { todayNutrition: { proteinFloor: DailyEnergyAdherence['proteinFloor'] } };
    };
    expect(dashboardData.data.macros.proteinFloor).toEqual(jwtDailyEnergy.proteinFloor);
    expect(contextData.data.todayNutrition.proteinFloor).toEqual(jwtDailyEnergy.proteinFloor);

    await setAuthenticatedSession(page, token);
    await page.goto('/', { waitUntil: 'networkidle' });
    const dashboardProtein = page
      .locator('[data-slot="macro-ring-item"]')
      .filter({ hasText: 'Protein' });
    await expect(dashboardProtein).toContainText('160g logged');
    await expect(dashboardProtein).toContainText('Minimum met');
    await expect(dashboardProtein).not.toContainText(/over target|too much/i);
    await expectNoOverflow(page, 1280, dashboardProtein);
    await capture(page, 'protein-floor-dashboard-1280.png');
    diagnostics();
  });

  test('shows an unavailable first-load state and replaces it after retry', async ({ page }) => {
    const path = `/api/v1/nutrition/${fixtureDate}/energy-adherence`;
    const diagnostics = monitorPage(
      page,
      [`GET ${path} 503`, `GET ${path} 503`],
      [
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
      ],
    );
    let failuresRemaining = 2;
    await page.route(`**${path}`, async (route) => {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        await route.fulfill({
          body: JSON.stringify({
            error: { code: 'PROTEIN_FLOOR_PREVIEW_FAILURE', message: 'Expected preview failure' },
          }),
          contentType: 'application/json',
          status: 503,
        });
        return;
      }
      await route.continue();
    });
    await page.setViewportSize({ width: 430, height: 1000 });
    await setAuthenticatedSession(page, token);
    await page.goto(`/nutrition?view=log&date=${fixtureDate}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Daily energy could not be loaded' }),
    ).toBeVisible();
    await expect(proteinCard(page)).toContainText('Protein minimum unavailable');
    await expect(proteinCard(page)).not.toContainText(/0g logged|Minimum met/);

    const recovered = page.waitForResponse(
      (candidate) => candidate.url().endsWith(path) && candidate.status() === 200,
    );
    await page.getByRole('button', { name: 'Retry daily energy' }).click();
    await recovered;
    await expect(
      page.getByRole('heading', { name: 'Daily energy could not be loaded' }),
    ).toHaveCount(0);
    await expect(proteinCard(page)).toContainText('160g');
    await expect(proteinCard(page)).toContainText('Minimum met');
    await page.waitForLoadState('networkidle');
    diagnostics();
  });

  test('fails closed when Nutrition date authority is unavailable and recovers exactly', async ({
    page,
  }) => {
    const authorityPath = '/api/v1/adaptive-nutrition';
    const diagnostics = monitorPage(
      page,
      [`GET ${authorityPath} 503`, `GET ${authorityPath} 503`],
      [
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
      ],
    );
    let failuresRemaining = 2;
    let dateBoundRequests = 0;
    await page.route(`**${authorityPath}`, async (route) => {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        await route.fulfill({
          body: JSON.stringify({
            error: { code: 'DATE_AUTHORITY_FAILURE', message: 'Expected preview failure' },
          }),
          contentType: 'application/json',
          status: 503,
        });
        return;
      }
      await route.continue();
    });
    page.on('request', (request) => {
      if (
        /\/api\/v1\/nutrition\/\d{4}-\d{2}-\d{2}\/energy-adherence$/.test(
          new URL(request.url()).pathname,
        )
      ) {
        dateBoundRequests += 1;
      }
    });

    await page.setViewportSize({ width: 320, height: 1000 });
    await setAuthenticatedSession(page, token);
    await page.goto('/nutrition?view=log', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('alert')).toContainText('Nutrition date could not be loaded');
    await expect(page.getByText('Protein minimum unavailable')).toHaveCount(0);
    expect(dateBoundRequests).toBe(0);

    const retry = page.getByRole('button', { name: 'Retry nutrition date' });
    const retryBox = await retry.boundingBox();
    expect(retryBox?.height).toBeGreaterThanOrEqual(44);
    const recoveredAuthority = page.waitForResponse(
      (response) => response.url().endsWith(authorityPath) && response.status() === 200,
    );
    const recoveredEnergy = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/nutrition/${fixtureDate}/energy-adherence`) &&
        response.status() === 200,
    );
    await retry.focus();
    await page.keyboard.press('Enter');
    await recoveredAuthority;
    await recoveredEnergy;
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(proteinCard(page)).toContainText('Minimum met');
    await expectNoOverflow(page, 320);
    await page.waitForLoadState('networkidle');
    diagnostics();
  });

  test('does not fabricate Dashboard facts when its exact snapshot fails', async ({ page }) => {
    const snapshotPath = `/api/v1/dashboard/snapshot?date=${fixtureDate}`;
    const diagnostics = monitorPage(
      page,
      [`GET /api/v1/dashboard/snapshot 503`, `GET /api/v1/dashboard/snapshot 503`],
      [
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
      ],
    );
    let failuresRemaining = 2;
    await page.route(`**${snapshotPath}`, async (route) => {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        await route.fulfill({
          body: JSON.stringify({
            error: { code: 'SNAPSHOT_FAILURE', message: 'Expected preview failure' },
          }),
          contentType: 'application/json',
          status: 503,
        });
        return;
      }
      await route.continue();
    });

    await page.setViewportSize({ width: 768, height: 1000 });
    await setAuthenticatedSession(page, token);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('alert')).toContainText('Dashboard snapshot could not be loaded');
    await expect(page.getByText('Protein minimum unavailable')).toHaveCount(0);
    await expect(page.getByText('Rest Day')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Log weight/i })).toHaveCount(0);

    const recovered = page.waitForResponse(
      (response) => response.url().endsWith(snapshotPath) && response.status() === 200,
    );
    await page.getByRole('button', { name: 'Retry dashboard snapshot' }).click();
    await recovered;
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText(/160g logged/).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    diagnostics();
  });

  test('retains an exact Dashboard snapshot after background refresh failure and recovers', async ({
    page,
  }) => {
    const snapshotPath = `/api/v1/dashboard/snapshot?date=${fixtureDate}`;
    const diagnostics = monitorPage(
      page,
      [`GET /api/v1/dashboard/snapshot 503`, `GET /api/v1/dashboard/snapshot 503`],
      [
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
      ],
    );
    await page.setViewportSize({ width: 1280, height: 1000 });
    await setAuthenticatedSession(page, token);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByText(/160g logged/).first()).toBeVisible();

    let failuresRemaining = 2;
    await page.route(`**${snapshotPath}`, async (route) => {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        await route.fulfill({
          body: JSON.stringify({
            error: { code: 'SNAPSHOT_REFRESH_FAILURE', message: 'Expected refresh failure' },
          }),
          contentType: 'application/json',
          status: 503,
        });
        return;
      }
      await route.continue();
    });

    await page.clock.fastForward(25_000);
    await expect(page.getByRole('alert')).toContainText('Dashboard snapshot refresh failed');
    await expect(page.getByRole('alert')).toContainText('Showing the last verified data');
    await expect(page.getByText(/160g logged/).first()).toBeVisible();
    const weightCard = page.getByTestId('dashboard-log-weight-card');
    await expect(weightCard.getByRole('button', { name: 'Log weight' })).toBeDisabled();

    const recovered = page.waitForResponse(
      (response) => response.url().endsWith(snapshotPath) && response.status() === 200,
    );
    await page.getByRole('button', { name: 'Retry dashboard snapshot' }).click();
    await recovered;
    await expect(page.getByText('Dashboard snapshot refresh failed')).toHaveCount(0);
    await expect(weightCard.getByRole('button', { name: 'Log weight' })).toBeEnabled();
    await page.waitForLoadState('networkidle');
    diagnostics();
  });

  test('keeps rapid Dashboard date changes isolated and rejects a mismatched response', async ({
    page,
  }) => {
    const baseResponse = await api.get(`/api/v1/dashboard/snapshot?date=${fixtureDate}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(baseResponse.ok(), await baseResponse.text()).toBeTruthy();
    const baseSnapshot = ((await baseResponse.json()) as { data: DashboardSnapshot }).data;
    const intermediateDate = addDays(fixtureDate, -4);
    const intermediateRangeStart = addDays(intermediateDate, -29);
    const finalDate = addDays(fixtureDate, -6);
    const intermediateSnapshot = snapshotWithProtein(baseSnapshot, intermediateDate, 111);
    const finalSnapshot = snapshotWithProtein(baseSnapshot, finalDate, 133);
    const intermediatePath = `/api/v1/dashboard/snapshot?date=${intermediateDate}`;
    const finalPath = `/api/v1/dashboard/snapshot?date=${finalDate}`;
    const diagnostics = monitorPage(
      page,
      [],
      [],
      [`GET ${intermediatePath} net::ERR_ABORTED`],
      [
        `GET /api/v1/dashboard/trends/macros?from=${intermediateRangeStart}&to=${intermediateDate} net::ERR_ABORTED`,
        `GET /api/v1/habit-entries?from=${intermediateRangeStart}&to=${intermediateDate} net::ERR_ABORTED`,
      ],
    );

    let releaseIntermediate!: () => void;
    const intermediateGate = new Promise<void>((resolvePromise) => {
      releaseIntermediate = resolvePromise;
    });
    let markIntermediateStarted!: () => void;
    const intermediateStarted = new Promise<void>((resolvePromise) => {
      markIntermediateStarted = resolvePromise;
    });
    await page.route(`**${intermediatePath}`, async (route) => {
      markIntermediateStarted();
      await intermediateGate;
      try {
        await route.fulfill({
          body: JSON.stringify({ data: intermediateSnapshot }),
          contentType: 'application/json',
          status: 200,
        });
      } catch {
        // A superseded query may cancel before the deliberately late response is released.
      }
    });

    let finalAttempts = 0;
    let releaseFinal!: () => void;
    const finalGate = new Promise<void>((resolvePromise) => {
      releaseFinal = resolvePromise;
    });
    let markFinalRetryStarted!: () => void;
    const finalRetryStarted = new Promise<void>((resolvePromise) => {
      markFinalRetryStarted = resolvePromise;
    });
    await page.route(`**${finalPath}`, async (route) => {
      finalAttempts += 1;
      if (finalAttempts === 1) {
        await route.fulfill({
          body: JSON.stringify({ data: { ...finalSnapshot, date: intermediateDate } }),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }
      markFinalRetryStarted();
      await finalGate;
      await route.fulfill({
        body: JSON.stringify({ data: finalSnapshot }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await page.setViewportSize({ width: 768, height: 1000 });
    await setAuthenticatedSession(page, token);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByText(/160g logged/).first()).toBeVisible();

    await selectDashboardDate(page, intermediateDate);
    await intermediateStarted;
    await expect(page.getByLabel('Loading dashboard snapshots')).toBeVisible();
    await selectDashboardDate(page, finalDate);
    await page.clock.fastForward(2_000);
    await finalRetryStarted;
    await expect(page.getByLabel('Loading dashboard snapshots')).toBeVisible();
    await expect(page.getByText(/111g logged/)).toHaveCount(0);
    await expect(page.getByText(/160g logged/)).toHaveCount(0);

    releaseIntermediate();
    await expect(page.getByText(/111g logged/)).toHaveCount(0);
    releaseFinal();
    await expect(page.getByText(/133g logged/).first()).toBeVisible();
    await expect(page.getByText(/27g to minimum/).first()).toBeVisible();
    await expect(page.getByText(/111g logged/)).toHaveCount(0);
    expect(finalAttempts).toBe(2);
    await page.waitForLoadState('networkidle');
    diagnostics();
  });

  test('retains verified Dashboard facts and locks writes after date refresh failure', async ({
    page,
  }) => {
    const authorityPath = '/api/v1/adaptive-nutrition';
    const diagnostics = monitorPage(
      page,
      [`GET ${authorityPath} 503`, `GET ${authorityPath} 503`],
      [
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
        'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
      ],
    );
    await page.setViewportSize({ width: 1280, height: 1000 });
    await setAuthenticatedSession(page, token);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByText(/160g logged/).first()).toBeVisible();

    let failuresRemaining = 2;
    await page.route(`**${authorityPath}`, async (route) => {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        await route.fulfill({
          body: JSON.stringify({
            error: { code: 'DATE_REFRESH_FAILURE', message: 'Expected preview failure' },
          }),
          contentType: 'application/json',
          status: 503,
        });
        return;
      }
      await route.continue();
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('alert')).toContainText('Date refresh failed');
    await expect(page.getByRole('alert')).toContainText(`${fixtureDate}`);
    await expect(page.getByRole('alert')).toContainText('America/Detroit');
    await expect(page.getByText(/160g logged/).first()).toBeVisible();
    const weightCard = page.getByTestId('dashboard-log-weight-card');
    await expect(weightCard.getByRole('button', { name: 'Log weight' })).toBeDisabled();

    const recovered = page.waitForResponse(
      (response) => response.url().endsWith(authorityPath) && response.status() === 200,
    );
    await page.getByRole('button', { name: 'Retry date refresh' }).click();
    await recovered;
    await expect(page.getByText('Date refresh failed')).toHaveCount(0);
    await expect(weightCard.getByRole('button', { name: 'Log weight' })).toBeEnabled();
    await page.waitForLoadState('networkidle');
    diagnostics();
  });

  test('shows a logged day without an accepted protein minimum as unavailable', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    await page.setViewportSize({ width: 768, height: 1000 });
    await setAuthenticatedSession(page, unavailableToken);
    const response = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith(`/api/v1/nutrition/${fixtureDate}/energy-adherence`) &&
        candidate.status() === 200,
    );
    await page.goto('/nutrition?view=log', {
      waitUntil: 'domcontentloaded',
    });
    const payload = (await (await response).json()) as { data: DailyEnergyAdherence };
    expect(payload.data.proteinFloor).toEqual({
      actualProteinGrams: 160,
      proteinFloorGrams: null,
      remainingToFloorGrams: null,
      amountAboveFloorGrams: null,
      state: 'unavailable',
      isFinal: true,
    });
    await expect(page.getByText('Protein minimum unavailable', { exact: true })).toBeVisible();
    await expect(page.getByText('160g logged', { exact: true })).toBeVisible();
    await expect(page.getByText(/Sunday, August 23/)).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    diagnostics();
  });

  test('reconciles a protein correction and completeness downgrade without changing the floor', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    const dailyResponse = await api.get(`/api/v1/nutrition/${fixtureDate}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(dailyResponse.ok(), await dailyResponse.text()).toBeTruthy();
    const daily = (await dailyResponse.json()) as {
      data: {
        meals: Array<{
          meal: { id: string };
          items: Array<{ id: string; protein: number }>;
        }>;
      };
    };
    const meal = daily.data.meals[0];
    const item = meal?.items[0];
    if (!meal || !item) throw new Error('Protein correction fixture is missing');
    const beforeResponse = await api.get(`/api/v1/nutrition/${fixtureDate}/energy-adherence`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(beforeResponse.ok(), await beforeResponse.text()).toBeTruthy();
    const before = ((await beforeResponse.json()) as { data: DailyEnergyAdherence }).data;

    try {
      const corrected = await api.patch(
        `/api/v1/nutrition/${fixtureDate}/meals/${meal.meal.id}/items/${item.id}`,
        {
          data: { protein: item.protein + 25 },
          headers: { authorization: `Bearer ${token}` },
        },
      );
      expect(corrected.ok(), await corrected.text()).toBeTruthy();

      const correctedFact = await openNutrition(page, fixtureDate);
      expect(correctedFact.proteinFloor).toEqual({
        actualProteinGrams: 185,
        proteinFloorGrams: 160,
        remainingToFloorGrams: 0,
        amountAboveFloorGrams: 25,
        state: 'floor_met',
        isFinal: false,
      });
      expect(correctedFact.target).toEqual(before.target);
      await expect(proteinCard(page)).toContainText('185g');
      await expect(proteinCard(page)).toContainText('Minimum met');
      await expect(proteinCard(page)).toContainText('Based on food logged so far');

      const completed = await api.patch(`/api/v1/nutrition/${fixtureDate}/status`, {
        data: { status: 'complete' },
        headers: { authorization: `Bearer ${token}` },
      });
      expect(completed.ok(), await completed.text()).toBeTruthy();
      const completedFact = await openNutrition(page, fixtureDate);
      expect(completedFact.proteinFloor.isFinal).toBe(true);
      await expect(proteinCard(page)).not.toContainText('Based on food logged so far');
    } finally {
      const restored = await api.patch(
        `/api/v1/nutrition/${fixtureDate}/meals/${meal.meal.id}/items/${item.id}`,
        {
          data: { protein: item.protein },
          headers: { authorization: `Bearer ${token}` },
        },
      );
      expect(restored.ok(), await restored.text()).toBeTruthy();
      const restoredStatus = await api.patch(`/api/v1/nutrition/${fixtureDate}/status`, {
        data: { status: 'complete' },
        headers: { authorization: `Bearer ${token}` },
      });
      expect(restoredStatus.ok(), await restoredStatus.text()).toBeTruthy();
      const restoredFact = await api.get(`/api/v1/nutrition/${fixtureDate}/energy-adherence`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(restoredFact.ok(), await restoredFact.text()).toBeTruthy();
      expect(
        ((await restoredFact.json()) as { data: DailyEnergyAdherence }).data.proteinFloor,
      ).toEqual(before.proteinFloor);
    }
    await page.waitForLoadState('networkidle');
    diagnostics();
  });
});
