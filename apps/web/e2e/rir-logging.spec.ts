import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';

import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'America/Detroit' });
test.describe.configure({ mode: 'serial' });

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const user = {
  password: 'rir-e2e-password',
  timeZone: 'America/Detroit',
  username: `rir-e2e-${suffix}`,
};
const fixtureDate = '2026-08-23';
const exerciseNames = {
  bench: `RIR Bench Press ${suffix}`,
  plank: `RIR Timed Plank ${suffix}`,
  pushup: `RIR Push-up ${suffix}`,
};

let api: APIRequestContext;
let authToken = '';
let agentToken: { id: string; token: string } | undefined;
let activeSessionId = '';
let activeBenchSetId = '';
let benchExerciseId = '';
let completedSessionId = '';
let completedLegacySetId = '';

function monitorPage(
  page: Page,
  expectedResponses: string[] = [],
  expectedConsoleErrors: string[] = [],
) {
  const failures: string[] = [];
  const remainingExpectedResponses = [...expectedResponses];
  const remainingExpectedConsoleErrors = [...expectedConsoleErrors];
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
  page.on('requestfailed', (failed) =>
    failures.push(
      `requestfailed: ${failed.method()} ${new URL(failed.url()).pathname} ${failed.failure()?.errorText ?? ''}`,
    ),
  );
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
    expect(failures, 'browser diagnostics').toEqual([]);
  };
}

async function authenticate(page: Page, theme: 'light' | 'dark' | 'midnight') {
  await page.addInitScript(
    ([token, selectedTheme]) => {
      window.localStorage.setItem('pulse-auth-token', token);
      if (!window.localStorage.getItem('pulse-theme')) {
        window.localStorage.setItem('pulse-theme', selectedTheme);
      }
    },
    [authToken, theme] as const,
  );
}

async function capture(page: Page, filename: string) {
  const directory = resolve(process.cwd(), '../../artifacts/issue-130');
  mkdirSync(directory, { recursive: true });
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: resolve(directory, filename),
  });
}

async function textContrastRatio(locator: Locator) {
  return locator.evaluate((element) => {
    const parse = (value: string) => {
      const channels =
        value
          .match(/[\d.]+/gu)
          ?.slice(0, 3)
          .map(Number) ?? [];
      return channels.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
    };
    const luminance = (channels: number[]) =>
      0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
    const styles = getComputedStyle(element);
    const foreground = luminance(parse(styles.color));
    const background = luminance(parse(styles.backgroundColor));
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
}

async function expectTheme(page: Page, theme: 'light' | 'dark' | 'midnight') {
  const rootClass = (await page.locator('html').getAttribute('class')) ?? '';
  expect(rootClass.includes('dark'), `${theme} dark class`).toBe(theme === 'dark');
  expect(rootClass.includes('theme-midnight'), `${theme} midnight class`).toBe(
    theme === 'midnight',
  );
}

async function expectNoOverflow(page: Page, width: number, inspected?: Locator) {
  await page.setViewportSize({ width, height: 1000 });
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    `${width}px document overflow`,
  ).toBe(true);
  if (inspected) {
    expect(
      await inspected.evaluate((element) => element.scrollWidth <= element.clientWidth),
      `${width}px RIR surface overflow`,
    ).toBe(true);
  }
}

async function exercisePanel(page: Page, exerciseName: string) {
  const toggle = page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { level: 3, name: exerciseName }) })
    .first();
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const panelId = await toggle.getAttribute('aria-controls');
  expect(panelId).toBeTruthy();
  const panel = page.locator(`#${panelId}`);
  await expect(panel).toBeVisible();
  return panel;
}

async function createSession(
  input: Record<string, unknown>,
): Promise<{ id: string; sets: Array<{ exerciseId: string; id: string; setNumber: number }> }> {
  const response = await api.post('/api/v1/workout-sessions', { data: input });
  expect(response.status(), await response.text()).toBe(201);
  return (
    (await response.json()) as {
      data: { id: string; sets: Array<{ exerciseId: string; id: string; setNumber: number }> };
    }
  ).data;
}

test.describe('First-class RIR logging', () => {
  test.beforeAll(async () => {
    const unauthenticatedApi = await request.newContext({ baseURL: apiBaseURL });
    try {
      const registration = await unauthenticatedApi.post('/api/v1/auth/register', { data: user });
      expect(registration.status(), await registration.text()).toBe(201);
      authToken = ((await registration.json()) as { data: { token: string } }).data.token;
    } finally {
      await unauthenticatedApi.dispose();
    }

    api = await request.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: { authorization: `Bearer ${authToken}` },
    });

    const exerciseIds: Record<keyof typeof exerciseNames, string> = {
      bench: '',
      plank: '',
      pushup: '',
    };
    for (const [key, exercise] of Object.entries({
      bench: {
        category: 'compound',
        equipment: 'barbell',
        muscleGroups: ['chest'],
        name: exerciseNames.bench,
        trackingType: 'weight_reps',
      },
      plank: {
        category: 'mobility',
        equipment: 'bodyweight',
        muscleGroups: ['core'],
        name: exerciseNames.plank,
        trackingType: 'seconds_only',
      },
      pushup: {
        category: 'compound',
        equipment: 'bodyweight',
        muscleGroups: ['chest'],
        name: exerciseNames.pushup,
        trackingType: 'bodyweight_reps',
      },
    }) as Array<[keyof typeof exerciseNames, Record<string, unknown>]>) {
      const response = await api.post('/api/v1/exercises', { data: exercise });
      expect(response.status(), await response.text()).toBe(201);
      exerciseIds[key] = ((await response.json()) as { data: { id: string } }).data.id;
    }
    benchExerciseId = exerciseIds.bench;

    const startedAt = Date.parse(`${fixtureDate}T14:00:00.000Z`);
    const activeSession = await createSession({
      date: fixtureDate,
      name: `RIR active session ${suffix}`,
      sets: [
        {
          completed: false,
          exerciseId: exerciseIds.bench,
          orderIndex: 0,
          reps: null,
          section: 'main',
          setNumber: 1,
          weight: null,
        },
        {
          completed: false,
          exerciseId: exerciseIds.pushup,
          orderIndex: 1,
          reps: null,
          section: 'main',
          setNumber: 1,
          weight: null,
        },
        {
          completed: false,
          exerciseId: exerciseIds.plank,
          orderIndex: 2,
          reps: null,
          section: 'main',
          setNumber: 1,
          weight: null,
        },
      ],
      startedAt,
      status: 'in-progress',
    });
    activeSessionId = activeSession.id;
    activeBenchSetId =
      activeSession.sets.find((set) => set.exerciseId === exerciseIds.bench)?.id ?? '';

    const completedSession = await createSession({
      completedAt: startedAt - 82_800_000,
      date: '2026-08-22',
      duration: 3_600,
      name: `RIR completed session ${suffix}`,
      sets: [
        {
          completed: true,
          exerciseId: exerciseIds.bench,
          orderIndex: 0,
          reps: 8,
          rpe: 8,
          section: 'main',
          setNumber: 1,
          weight: 155,
        },
        {
          completed: true,
          exerciseId: exerciseIds.bench,
          orderIndex: 0,
          reps: 8,
          rir: 5,
          section: 'main',
          setNumber: 2,
          weight: 155,
        },
      ],
      startedAt: startedAt - 86_400_000,
      status: 'completed',
    });
    completedSessionId = completedSession.id;
    completedLegacySetId = completedSession.sets.find((set) => set.setNumber === 1)?.id ?? '';

    const agentResponse = await api.post('/api/v1/agent-tokens', {
      data: { name: `RIR E2E ${suffix}` },
    });
    expect(agentResponse.status(), await agentResponse.text()).toBe(201);
    agentToken = ((await agentResponse.json()) as { data: { id: string; token: string } }).data;
  });

  test.afterAll(async () => {
    if (agentToken) {
      await api.delete(`/api/v1/agent-tokens/${agentToken.id}`);
    }
    await api.dispose();
  });

  test('logs boundaries by keyboard, persists on resume, excludes timed work, and rolls back failure', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const diagnostics = monitorPage(
      page,
      [`PATCH /api/v1/workout-sessions/${activeSessionId}/sets/${activeBenchSetId} 503`],
      ['Failed to load resource: the server responded with a status of 503 (Service Unavailable)'],
    );
    await page.setViewportSize({ width: 320, height: 1000 });
    await authenticate(page, 'light');
    await page.goto(`/workouts/active?sessionId=${activeSessionId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectTheme(page, 'light');

    const benchPanel = await exercisePanel(page, exerciseNames.bench);
    const benchTrigger = benchPanel.locator('[data-slot="popover-trigger"]');
    await expect(benchTrigger).toBeVisible();
    await expect(benchTrigger).toHaveAccessibleName(
      'RIR for set 1: No repetitions in reserve logged',
    );
    await expect(benchTrigger).toHaveText('RIR —');
    const triggerBox = await benchTrigger.boundingBox();
    expect(triggerBox?.height, 'RIR trigger touch target').toBeGreaterThanOrEqual(44);
    await expectNoOverflow(page, 320, benchPanel.locator('[data-slot="set-row"]').first());
    await capture(page, 'rir-active-unset-320-light.png');

    const firstPatch = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/sets/${activeBenchSetId}`) && response.status() === 200,
    );
    await benchTrigger.focus();
    await page.keyboard.press('Enter');
    const group = page.getByRole('radiogroup', { name: 'RIR selection for set 1' });
    await expect(group).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Repetitions in reserve · Set 1' }),
    ).toHaveAccessibleDescription('0 = no reps left · 5+ = five or more reps left');
    const clear = group.getByRole('radio', { name: 'Clear repetitions in reserve' });
    await clear.focus();
    expect(await textContrastRatio(clear), 'selected RIR contrast').toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('ArrowRight');
    const firstPayload = (await (await firstPatch).json()) as {
      data: { completed: boolean; rir?: number };
    };
    expect(firstPayload.data).toMatchObject({ completed: false, rir: 0 });
    await expect(
      benchPanel.getByRole('button', { name: /0 repetitions in reserve/u }),
    ).toBeVisible();
    for (const option of await group.getByRole('radio').all()) {
      const box = await option.boundingBox();
      expect(
        box?.height,
        `${await option.getAttribute('aria-label')} touch target`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        box?.width,
        `${await option.getAttribute('aria-label')} touch target`,
      ).toBeGreaterThanOrEqual(44);
    }
    await page.keyboard.press('Escape');
    await expect(benchTrigger).toBeFocused();
    await expectNoOverflow(page, 320, benchPanel.locator('[data-slot="set-row"]').first());
    await capture(page, 'rir-active-0-320-light.png');

    await benchTrigger.click();
    const fivePatch = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/sets/${activeBenchSetId}`) && response.status() === 200,
    );
    await group.getByRole('radio', { name: '5 or more repetitions in reserve' }).click();
    const fivePayload = (await (await fivePatch).json()) as {
      data: { completed: boolean; rir?: number; rpe?: number };
    };
    expect(fivePayload.data).toMatchObject({ completed: false, rir: 5 });
    expect(fivePayload.data).not.toHaveProperty('rpe');
    await expect(benchTrigger).toBeFocused();
    await page.reload({ waitUntil: 'networkidle' });
    const resumedBenchPanel = await exercisePanel(page, exerciseNames.bench);
    await expect(
      resumedBenchPanel.getByRole('button', { name: /5 or more repetitions in reserve/u }),
    ).toHaveText('5+ RIR');

    const pushupPanel = await exercisePanel(page, exerciseNames.pushup);
    await expect(pushupPanel.getByRole('button', { name: /RIR for set 1/u })).toBeVisible();
    const plankPanel = await exercisePanel(page, exerciseNames.plank);
    await expect(plankPanel.getByLabel('Seconds for set 1')).toBeVisible();
    await expect(plankPanel.getByRole('button', { name: /RIR for set 1/u })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 1000 });
    await page.evaluate(() => window.localStorage.setItem('pulse-theme', 'dark'));
    await page.reload({ waitUntil: 'networkidle' });
    await expectTheme(page, 'dark');
    const darkBenchPanel = await exercisePanel(page, exerciseNames.bench);
    await expectNoOverflow(page, 390, darkBenchPanel.locator('[data-slot="set-row"]').first());
    await capture(page, 'rir-active-5-plus-390-dark.png');

    await page.setViewportSize({ width: 430, height: 1000 });
    await page.evaluate(() => window.localStorage.setItem('pulse-theme', 'midnight'));
    await page.reload({ waitUntil: 'networkidle' });
    await expectTheme(page, 'midnight');
    const midnightBenchPanel = await exercisePanel(page, exerciseNames.bench);
    await expectNoOverflow(page, 430, midnightBenchPanel.locator('[data-slot="set-row"]').first());
    await capture(page, 'rir-active-5-plus-430-midnight.png');

    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.evaluate(() => window.localStorage.setItem('pulse-theme', 'light'));
    await page.reload({ waitUntil: 'networkidle' });
    await expectTheme(page, 'light');
    const desktopBenchPanel = await exercisePanel(page, exerciseNames.bench);
    await expectNoOverflow(page, 1280, desktopBenchPanel.locator('[data-slot="set-row"]').first());
    await capture(page, 'rir-active-5-plus-1280-light.png');

    let failedOnce = false;
    await page.route(
      `**/api/v1/workout-sessions/${activeSessionId}/sets/${activeBenchSetId}`,
      async (route) => {
        if (route.request().method() === 'PATCH' && !failedOnce) {
          failedOnce = true;
          await route.fulfill({
            body: JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: 'Try again' } }),
            contentType: 'application/json',
            status: 503,
          });
          return;
        }
        await route.fallback();
      },
    );
    const restoredTrigger = desktopBenchPanel.locator('[data-slot="popover-trigger"]');
    await expect(restoredTrigger).toHaveAccessibleName(
      'RIR for set 1: 5 or more repetitions in reserve',
    );
    await restoredTrigger.click();
    await page.getByRole('radio', { name: '4 repetitions in reserve' }).click();
    await expect(
      page.getByText('RIR was not saved. The previous value was restored.'),
    ).toBeVisible();
    await expect(restoredTrigger).toHaveText('5+ RIR');
    const persisted = await api.get(`/api/v1/workout-sessions/${activeSessionId}`);
    expect(persisted.ok(), await persisted.text()).toBeTruthy();
    const persistedPayload = (await persisted.json()) as {
      data: { sets: Array<{ id: string; rir?: number; completed: boolean }> };
    };
    expect(persistedPayload.data.sets.find((set) => set.id === activeBenchSetId)).toMatchObject({
      completed: false,
      rir: 5,
    });
    diagnostics();
  });

  test('corrects completed native effort and exposes exact history with JWT and AgentToken parity', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const diagnostics = monitorPage(
      page,
      [`PATCH /api/v1/workout-sessions/${completedSessionId}/corrections 503`],
      ['Failed to load resource: the server responded with a status of 503 (Service Unavailable)'],
    );
    await page.setViewportSize({ width: 430, height: 1000 });
    await authenticate(page, 'midnight');
    await page.goto(`/workouts/session/${completedSessionId}`, { waitUntil: 'networkidle' });
    await expectTheme(page, 'midnight');
    await expect(page.getByText(/Set 1: 155 lbs × 8 reps \(RPE 8\)/u)).toBeVisible();
    await expect(page.getByText(/Set 2: 155 lbs × 8 reps \(5\+ RIR\)/u)).toBeVisible();

    let failedCorrection = false;
    await page.route(
      `**/api/v1/workout-sessions/${completedSessionId}/corrections`,
      async (route) => {
        if (route.request().method() === 'PATCH' && !failedCorrection) {
          failedCorrection = true;
          await route.fulfill({
            body: JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: 'Try again' } }),
            contentType: 'application/json',
            status: 503,
          });
          return;
        }
        await route.fallback();
      },
    );
    await page.getByRole('button', { name: 'Edit' }).click();
    await page
      .getByRole('button', { name: /RIR for set 1: No repetitions in reserve logged/u })
      .click();
    await page.getByRole('radio', { name: '3 repetitions in reserve' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Failed to save corrections. Please try again.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await expect(
      page.getByRole('button', { name: /RIR for set 1: 3 repetitions in reserve/u }),
    ).toBeVisible();
    const afterFailedCorrection = await api.get(`/api/v1/workout-sessions/${completedSessionId}`);
    expect(afterFailedCorrection.ok(), await afterFailedCorrection.text()).toBeTruthy();
    const failedSet = (
      (await afterFailedCorrection.json()) as {
        data: { sets: Array<{ id: string; rir?: number; rpe?: number }> };
      }
    ).data.sets.find((set) => set.id === completedLegacySetId);
    expect(failedSet).toMatchObject({ rpe: 8 });
    expect(failedSet).not.toHaveProperty('rir');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Edit' }).click();
    const trigger = page.getByRole('button', {
      name: /RIR for set 1: No repetitions in reserve logged/u,
    });
    await trigger.click();
    await expect(page.getByText('0 = no reps left · 5+ = five or more reps left')).toBeVisible();
    await expectNoOverflow(page, 430, page.getByRole('dialog'));
    await capture(page, 'rir-correction-picker-430-midnight.png');

    const correctionRequest = page.waitForRequest(
      (candidate) =>
        candidate.url().endsWith(`/workout-sessions/${completedSessionId}/corrections`) &&
        candidate.method() === 'PATCH',
    );
    await page.getByRole('radio', { name: '2 repetitions in reserve' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    const requestPayload = (await correctionRequest).postDataJSON() as unknown;
    expect(requestPayload).toEqual({
      corrections: [{ setId: completedLegacySetId, rir: 2, rpe: null }],
    });
    await expect(page.getByText(/Set 1: 155 lbs × 8 reps \(2 RIR\)/u)).toBeVisible();
    await expect(page.getByText(/Set 2: 155 lbs × 8 reps \(5\+ RIR\)/u)).toBeVisible();

    if (!agentToken) throw new Error('Missing RIR AgentToken');
    const [jwtDetail, agentDetail, history] = await Promise.all([
      api.get(`/api/v1/workout-sessions/${completedSessionId}`),
      api.get(`/api/v1/workout-sessions/${completedSessionId}`, {
        headers: { authorization: `AgentToken ${agentToken.token}` },
      }),
      api.get(`/api/v1/exercises/${benchExerciseId}/history`),
    ]);
    expect(jwtDetail.ok(), await jwtDetail.text()).toBeTruthy();
    expect(agentDetail.ok(), await agentDetail.text()).toBeTruthy();
    expect((await agentDetail.json()).data).toEqual((await jwtDetail.json()).data);
    expect(history.ok(), await history.text()).toBeTruthy();
    expect(((await history.json()) as { data: unknown }).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: completedSessionId,
          sets: expect.arrayContaining([
            expect.objectContaining({ rir: 2, setNumber: 1 }),
            expect.objectContaining({ rir: 5, setNumber: 2 }),
          ]),
        }),
      ]),
    );

    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.evaluate(() => window.localStorage.setItem('pulse-theme', 'light'));
    await page.reload({ waitUntil: 'networkidle' });
    await expectTheme(page, 'light');
    await expect(page.getByText(/Set 1: 155 lbs × 8 reps \(2 RIR\)/u)).toBeVisible();
    await expectNoOverflow(page, 1280);
    await capture(page, 'rir-history-1280-light.png');
    diagnostics();
  });
});
