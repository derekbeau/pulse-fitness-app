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
  cardio: `RIR Cardio ${suffix}`,
  distance: `RIR Distance ${suffix}`,
  duration: `RIR Duration ${suffix}`,
  plank: `RIR Timed Plank ${suffix}`,
  pushup: `RIR Push-up ${suffix}`,
  repsOnly: `RIR Reps Only ${suffix}`,
  repsSeconds: `RIR Reps Seconds ${suffix}`,
  weightSeconds: `RIR Weight Seconds ${suffix}`,
};

let api: APIRequestContext;
let authToken = '';
let agentToken: { id: string; token: string } | undefined;
let activeSessionId = '';
let activeBenchSetId = '';
let activeBenchSecondSetId = '';
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
  const directory = resolve(process.cwd(), '../../artifacts/issues-140-142');
  mkdirSync(directory, { recursive: true });
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: resolve(directory, filename),
  });
}

async function expectPopulatedMetricGeometry(panel: Locator, width: number, layoutName: string) {
  const measurements = await panel.locator('[data-slot="metric-input"]').evaluateAll((inputs) =>
    inputs
      .filter(
        (input): input is HTMLInputElement =>
          input instanceof HTMLInputElement && input.value !== '',
      )
      .map((input) => {
        const styles = getComputedStyle(input);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas text measurement is unavailable');
        context.font = styles.font;
        const textWidth = context.measureText(input.value).width;
        const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
        const horizontalBorder =
          parseFloat(styles.borderLeftWidth) + parseFloat(styles.borderRightWidth);
        const nativeNumberControlAllowance = 18;
        return {
          accessibleName: input.getAttribute('aria-label'),
          innerContentWidth:
            input.getBoundingClientRect().width -
            horizontalPadding -
            horizontalBorder -
            nativeNumberControlAllowance,
          requiredTextWidth: textWidth + 4,
          touchHeight: input.getBoundingClientRect().height,
          value: input.value,
        };
      }),
  );

  expect(measurements.length, `${width}px ${layoutName} populated input count`).toBeGreaterThan(0);
  for (const measurement of measurements) {
    expect(
      measurement.innerContentWidth,
      `${width}px ${measurement.accessibleName} inner width`,
    ).toBeGreaterThanOrEqual(Math.max(24, measurement.requiredTextWidth));
    expect(
      measurement.touchHeight,
      `${width}px ${measurement.accessibleName} touch height`,
    ).toBeGreaterThanOrEqual(44);
  }

  const fieldBoxes = await panel.locator('[data-slot="metric-field"]').evaluateAll((fields) =>
    fields.map((field) => {
      const input = field.querySelector<HTMLInputElement>('[data-slot="metric-input"]');
      const unit = field.querySelector<HTMLElement>('[data-slot="metric-unit"]');
      if (!input || !unit) return null;
      const inputBox = input.getBoundingClientRect();
      const unitBox = unit.getBoundingClientRect();
      return { inputRight: inputBox.right, unitLeft: unitBox.left };
    }),
  );
  for (const boxes of fieldBoxes) {
    if (boxes)
      expect(boxes.unitLeft, `${width}px unit separation`).toBeGreaterThanOrEqual(boxes.inputRight);
  }
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

async function editMetricAndWaitForSave(page: Page, input: Locator, value: string) {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'PATCH' &&
      candidate.url().includes('/api/v1/workout-sessions/') &&
      candidate.url().includes('/sets/') &&
      candidate.status() === 200,
  );
  await input.fill(value);
  await input.blur();
  await response;
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
      cardio: '',
      distance: '',
      duration: '',
      plank: '',
      pushup: '',
      repsOnly: '',
      repsSeconds: '',
      weightSeconds: '',
    };
    for (const [key, exercise] of Object.entries({
      bench: {
        category: 'compound',
        equipment: 'barbell',
        muscleGroups: ['chest'],
        name: exerciseNames.bench,
        trackingType: 'weight_reps',
      },
      cardio: {
        category: 'cardio',
        equipment: 'bodyweight',
        muscleGroups: ['full-body'],
        name: exerciseNames.cardio,
        trackingType: 'cardio',
      },
      distance: {
        category: 'cardio',
        equipment: 'bodyweight',
        muscleGroups: ['full-body'],
        name: exerciseNames.distance,
        trackingType: 'distance',
      },
      duration: {
        category: 'mobility',
        equipment: 'bodyweight',
        muscleGroups: ['core'],
        name: exerciseNames.duration,
        trackingType: 'duration',
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
      repsOnly: {
        category: 'mobility',
        equipment: 'bodyweight',
        muscleGroups: ['core'],
        name: exerciseNames.repsOnly,
        trackingType: 'reps_only',
      },
      repsSeconds: {
        category: 'mobility',
        equipment: 'bodyweight',
        muscleGroups: ['core'],
        name: exerciseNames.repsSeconds,
        trackingType: 'reps_seconds',
      },
      weightSeconds: {
        category: 'compound',
        equipment: 'barbell',
        muscleGroups: ['back'],
        name: exerciseNames.weightSeconds,
        trackingType: 'weight_seconds',
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
          rpe: 8,
          section: 'main',
          setNumber: 1,
          weight: null,
        },
        {
          completed: true,
          exerciseId: exerciseIds.bench,
          orderIndex: 0,
          reps: 12,
          rir: 5,
          section: 'main',
          setNumber: 2,
          targetWeight: 155,
          weight: 157.5,
        },
        {
          completed: true,
          exerciseId: exerciseIds.bench,
          orderIndex: 0,
          reps: 12,
          section: 'main',
          setNumber: 3,
          targetWeightMax: 225,
          targetWeightMin: 205,
          weight: 225,
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
          completed: true,
          exerciseId: exerciseIds.pushup,
          orderIndex: 1,
          reps: 12,
          section: 'main',
          setNumber: 2,
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
        {
          completed: true,
          exerciseId: exerciseIds.plank,
          orderIndex: 2,
          reps: null,
          seconds: 3600,
          section: 'main',
          setNumber: 2,
          targetSeconds: 3600,
          weight: null,
        },
        ...[
          {
            exerciseId: exerciseIds.repsOnly,
            orderIndex: 3,
            populated: { reps: 12 },
            target: {},
          },
          {
            exerciseId: exerciseIds.repsSeconds,
            orderIndex: 4,
            populated: { reps: 12, seconds: 3600 },
            target: { targetSeconds: 3600 },
          },
          {
            exerciseId: exerciseIds.weightSeconds,
            orderIndex: 5,
            populated: { reps: null, seconds: 3600, weight: 155.5 },
            target: { targetSeconds: 45, targetWeight: 155 },
          },
          {
            exerciseId: exerciseIds.duration,
            orderIndex: 6,
            populated: { reps: null, rpe: 8, seconds: 3600, zone: 3 },
            target: { targetSeconds: 3600 },
          },
          {
            exerciseId: exerciseIds.distance,
            orderIndex: 7,
            populated: { distance: 5.4, reps: null },
            target: { targetDistance: 5.4 },
          },
          {
            exerciseId: exerciseIds.cardio,
            orderIndex: 8,
            populated: { distance: 5.4, reps: null, seconds: 3600 },
            target: { targetDistance: 5.4, targetSeconds: 3600 },
          },
        ].flatMap(({ exerciseId, orderIndex, populated, target }) => [
          {
            completed: true,
            exerciseId,
            orderIndex,
            section: 'main',
            setNumber: 1,
            weight: null,
            ...populated,
            ...target,
          },
          {
            completed: false,
            exerciseId,
            orderIndex,
            reps: null,
            section: 'main',
            setNumber: 2,
            weight: null,
          },
        ]),
      ],
      startedAt,
      status: 'in-progress',
    });
    activeSessionId = activeSession.id;
    activeBenchSetId =
      activeSession.sets.find((set) => set.exerciseId === exerciseIds.bench)?.id ?? '';
    activeBenchSecondSetId =
      activeSession.sets.find((set) => set.exerciseId === exerciseIds.bench && set.setNumber === 2)
        ?.id ?? '';

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

  test('keeps every populated tracking layout readable across viewport and theme matrices', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const diagnostics = monitorPage(page);
    const layouts = [
      {
        labels: ['Weight for set 2', 'Reps for set 2'],
        name: exerciseNames.bench,
        values: ['157.5', '12'],
      },
      {
        labels: ['Weight for set 1', 'Seconds for set 1'],
        name: exerciseNames.weightSeconds,
        values: ['155.5', '3600'],
      },
      { labels: ['Reps for set 2'], name: exerciseNames.pushup, values: ['12'] },
      { labels: ['Reps for set 1'], name: exerciseNames.repsOnly, values: ['12'] },
      {
        labels: ['Reps for set 1', 'Seconds for set 1'],
        name: exerciseNames.repsSeconds,
        values: ['12', '3600'],
      },
      { labels: ['Seconds for set 2'], name: exerciseNames.plank, values: ['3600'] },
      {
        labels: ['Duration for set 1', 'RPE for set 1', 'Zone for set 1'],
        name: exerciseNames.duration,
        values: ['3600', '8', '3'],
      },
      { labels: ['Distance for set 1'], name: exerciseNames.distance, values: ['5.4'] },
      {
        labels: ['Seconds for set 1', 'Distance for set 1'],
        name: exerciseNames.cardio,
        values: ['3600', '5.4'],
      },
    ] as const;
    const viewports = [320, 390, 430, 768, 1280] as const;
    const themes = ['light', 'dark', 'midnight'] as const;

    await authenticate(page, 'light');
    await page.setViewportSize({ width: 320, height: 1200 });
    await page.goto(`/workouts/active?sessionId=${activeSessionId}`, {
      waitUntil: 'networkidle',
    });

    for (const width of viewports) {
      for (const theme of themes) {
        await page.setViewportSize({ width, height: 1200 });
        await page.evaluate((selectedTheme) => {
          window.localStorage.setItem('pulse-theme', selectedTheme);
        }, theme);
        await page.reload({ waitUntil: 'networkidle' });
        await expectTheme(page, theme);

        for (const layout of layouts) {
          const panel = await exercisePanel(page, layout.name);
          for (const [index, label] of layout.labels.entries()) {
            const input = panel.getByLabel(label);
            await expect(input).toHaveValue(layout.values[index] ?? '');
            await input.focus();
            await expect(input).toBeFocused();
          }
          await expectPopulatedMetricGeometry(panel, width, layout.name);
          await expect(panel.locator('[data-slot="set-row"].bg-emerald-500\\/10')).toHaveCount(
            layout.name === exerciseNames.bench ? 2 : 1,
          );
        }

        await expect(page.getByText('Target: 155 lbs', { exact: true })).toBeVisible();
        await expect(page.getByText('Target: 155 lbs × 45 sec', { exact: true })).toBeVisible();
        await expectNoOverflow(page, width);
        await capture(page, `mobile-entry-${width}-${theme}.png`);
      }
    }

    const persistedEdits = [
      { label: 'Reps for set 1', name: exerciseNames.pushup, value: '12' },
      { label: 'Seconds for set 1', name: exerciseNames.plank, value: '45' },
      { label: 'Reps for set 2', name: exerciseNames.repsOnly, value: '12' },
      { label: 'Reps for set 2', name: exerciseNames.repsSeconds, value: '12' },
      { label: 'Seconds for set 2', name: exerciseNames.repsSeconds, value: '3600' },
      { label: 'Weight for set 2', name: exerciseNames.weightSeconds, value: '155.5' },
      { label: 'Seconds for set 2', name: exerciseNames.weightSeconds, value: '45' },
      { label: 'Duration for set 2', name: exerciseNames.duration, value: '3600' },
      { label: 'RPE for set 2', name: exerciseNames.duration, value: '9' },
      { label: 'Zone for set 2', name: exerciseNames.duration, value: '4' },
      { label: 'Distance for set 2', name: exerciseNames.distance, value: '5.4' },
      { label: 'Seconds for set 2', name: exerciseNames.cardio, value: '3600' },
      { label: 'Distance for set 2', name: exerciseNames.cardio, value: '5.4' },
    ] as const;
    for (const edit of persistedEdits) {
      const panel = await exercisePanel(page, edit.name);
      await editMetricAndWaitForSave(page, panel.getByLabel(edit.label), edit.value);
    }

    await page.setViewportSize({ width: 430, height: 1200 });
    await page.reload({ waitUntil: 'networkidle' });
    for (const edit of persistedEdits) {
      const panel = await exercisePanel(page, edit.name);
      await expect(panel.getByLabel(edit.label)).toHaveValue(edit.value);
    }
    await expectNoOverflow(page, 430);
    await capture(page, 'mobile-entry-edited-resume-430-midnight.png');

    await page.setViewportSize({ width: 320, height: 568 });
    const keyboardHeightPanel = await exercisePanel(page, exerciseNames.weightSeconds);
    const keyboardHeightInput = keyboardHeightPanel.getByLabel('Seconds for set 1');
    await keyboardHeightInput.scrollIntoViewIfNeeded();
    await keyboardHeightInput.focus();
    const keyboardHeightBox = await keyboardHeightInput.boundingBox();
    expect(keyboardHeightBox?.y, 'simulated keyboard-height input top').toBeGreaterThanOrEqual(0);
    expect(
      (keyboardHeightBox?.y ?? 568) + (keyboardHeightBox?.height ?? 0),
      'simulated keyboard-height input bottom',
    ).toBeLessThanOrEqual(568);
    await expectNoOverflow(page, 320);
    await capture(page, 'mobile-entry-320-midnight-keyboard-height-emulation.png');
    diagnostics();
  });

  test('scopes digit shortcuts, saves once, persists on resume, and rolls back the RIR/RPE pair', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const diagnostics = monitorPage(
      page,
      [`PATCH /api/v1/workout-sessions/${activeSessionId}/sets/${activeBenchSetId} 503`],
      ['Failed to load resource: the server responded with a status of 503 (Service Unavailable)'],
    );
    const patchBodies: Array<Record<string, unknown>> = [];
    page.on('request', (request) => {
      if (
        request.method() === 'PATCH' &&
        request.url().endsWith(`/workout-sessions/${activeSessionId}/sets/${activeBenchSetId}`)
      ) {
        patchBodies.push(request.postDataJSON() as Record<string, unknown>);
      }
    });
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
    await page.setViewportSize({ width: 320, height: 1000 });
    await authenticate(page, 'light');
    await page.goto(`/workouts/active?sessionId=${activeSessionId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectTheme(page, 'light');

    const benchPanel = await exercisePanel(page, exerciseNames.bench);
    const benchTrigger = benchPanel.locator('[data-slot="popover-trigger"]').first();
    await expect(benchTrigger).toBeVisible();
    await expect(benchTrigger).toHaveAccessibleName(
      'RIR for set 1: No repetitions in reserve logged',
    );
    await expect(benchTrigger).toHaveText('RIR —');
    const triggerBox = await benchTrigger.boundingBox();
    expect(triggerBox?.height, 'RIR trigger touch target').toBeGreaterThanOrEqual(44);
    await expectNoOverflow(page, 320, benchPanel.locator('[data-slot="set-row"]').first());
    await capture(page, 'rir-active-unset-320-light.png');

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

    for (const key of ['Shift+3', 'Control+3', 'Alt+3', 'Meta+3']) {
      await page.keyboard.press(key);
      await expect(group).toBeVisible();
    }
    await clear.dispatchEvent('keydown', { key: '3', repeat: true });
    await clear.dispatchEvent('keydown', { isComposing: true, key: '3' });
    await expect(group).toBeVisible();
    expect(patchBodies).toHaveLength(0);

    const failedPatch = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/sets/${activeBenchSetId}`) && response.status() === 503,
    );
    await page.keyboard.press('3');
    await failedPatch;
    await expect(
      page.getByText('RIR was not saved. The previous value was restored.'),
    ).toBeVisible();
    await expect(benchTrigger).toBeFocused();
    await expect(benchTrigger).toHaveText('RIR —');
    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toMatchObject({ completed: false, rir: 3, rpe: null });
    const afterFailure = await api.get(`/api/v1/workout-sessions/${activeSessionId}`);
    const failedSet = (
      (await afterFailure.json()) as {
        data: { sets: Array<{ id: string; rir?: number; rpe?: number }> };
      }
    ).data.sets.find((set) => set.id === activeBenchSetId);
    expect(failedSet).toMatchObject({ rpe: 8 });
    expect(failedSet).not.toHaveProperty('rir');

    for (const digit of [0, 1, 2, 3, 4, 5]) {
      await benchTrigger.click();
      const digitGroup = page.getByRole('radiogroup', { name: 'RIR selection for set 1' });
      await digitGroup.getByRole('radio').first().focus();
      const successfulPatch = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/sets/${activeBenchSetId}`) && response.status() === 200,
      );
      await page.keyboard.press(`${digit}`);
      await successfulPatch;
      await expect(benchTrigger).toBeFocused();
      expect(patchBodies.at(-1)).toMatchObject({ completed: false, rir: digit, rpe: null });
      expect(patchBodies).toHaveLength(digit + 2);
    }
    await expect(benchTrigger).toHaveText('5+ RIR');

    await benchTrigger.click();
    const keypadOption = page.getByRole('radiogroup').getByRole('radio').first();
    await keypadOption.focus();
    const keypadPatch = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/sets/${activeBenchSetId}`) && response.status() === 200,
    );
    await keypadOption.dispatchEvent('keydown', { code: 'Numpad5', key: '5' });
    await keypadPatch;
    expect(patchBodies.at(-1)).toMatchObject({ rir: 5, rpe: null });
    expect(patchBodies).toHaveLength(8);

    await benchTrigger.click();
    const scopedWeightPatch = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/sets/${activeBenchSetId}`) && response.status() === 200,
    );
    await benchPanel.getByLabel('Weight for set 1').fill('155');
    await benchPanel.getByLabel('Weight for set 1').blur();
    await scopedWeightPatch;
    expect(patchBodies).toHaveLength(9);
    expect(patchBodies.at(-1)).toMatchObject({ completed: false, reps: null, weight: 155 });
    expect(patchBodies.at(-1)).not.toHaveProperty('rir');

    await benchTrigger.click();
    const scopedRepsPatch = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/sets/${activeBenchSetId}`) && response.status() === 200,
    );
    await benchPanel.getByLabel('Reps for set 1').fill('12');
    await benchPanel.getByLabel('Reps for set 1').blur();
    await scopedRepsPatch;
    expect(patchBodies).toHaveLength(10);
    expect(patchBodies.at(-1)).toMatchObject({ completed: true, reps: 12, weight: 155 });
    expect(patchBodies.at(-1)).not.toHaveProperty('rir');

    await page.reload({ waitUntil: 'networkidle' });
    const resumedBenchPanel = await exercisePanel(page, exerciseNames.bench);
    await expect(
      resumedBenchPanel.getByRole('button', {
        name: /RIR for set 1: 5 or more repetitions in reserve/u,
      }),
    ).toHaveText('5+ RIR');

    await expect(resumedBenchPanel.getByLabel('Weight for set 1')).toHaveValue('155');
    await expect(resumedBenchPanel.getByLabel('Reps for set 1')).toHaveValue('12');
    const persisted = await api.get(`/api/v1/workout-sessions/${activeSessionId}`);
    const persistedPayload = (await persisted.json()) as {
      data: { sets: Array<{ completed: boolean; id: string; rir?: number; setNumber: number }> };
    };
    expect(persistedPayload.data.sets.find((set) => set.id === activeBenchSetId)).toMatchObject({
      completed: true,
      rir: 5,
    });
    expect(
      persistedPayload.data.sets.find((set) => set.id === activeBenchSecondSetId),
    ).toMatchObject({ rir: 5 });

    const completedTrigger = resumedBenchPanel.locator('[data-slot="popover-trigger"]').nth(1);
    await expect(completedTrigger).toHaveAccessibleName(
      /RIR for set 2: 5 or more repetitions in reserve/u,
    );
    await completedTrigger.click();
    await page.getByRole('radiogroup').getByRole('radio').first().focus();
    const completedSelectionRequest = page.waitForRequest(
      (candidate) =>
        candidate.method() === 'PATCH' &&
        candidate.url().endsWith(`/sets/${activeBenchSecondSetId}`),
    );
    await page.keyboard.press('4');
    expect((await completedSelectionRequest).postDataJSON()).toMatchObject({
      completed: true,
      rir: 4,
      rpe: null,
    });
    await expect(completedTrigger).toBeFocused();

    await completedTrigger.click();
    await page.getByRole('radiogroup').getByRole('radio').first().focus();
    const restoreCompletedSelection = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/sets/${activeBenchSecondSetId}`) && response.status() === 200,
    );
    await page.keyboard.press('5');
    await restoreCompletedSelection;
    const afterCompletedRirEdit = await api.get(`/api/v1/workout-sessions/${activeSessionId}`);
    const afterCompletedRirPayload = (await afterCompletedRirEdit.json()) as {
      data: { sets: Array<{ completed: boolean; id: string; rir?: number }> };
    };
    expect(
      afterCompletedRirPayload.data.sets.find((set) => set.id === activeBenchSecondSetId),
    ).toMatchObject({ completed: true, rir: 5 });
    expect(
      afterCompletedRirPayload.data.sets.find((set) => set.id === activeBenchSetId),
    ).toMatchObject({ completed: true, rir: 5 });

    const pushupPanel = await exercisePanel(page, exerciseNames.pushup);
    await expect(pushupPanel.getByRole('button', { name: /RIR for set 1/u })).toBeVisible();
    const plankPanel = await exercisePanel(page, exerciseNames.plank);
    await expect(plankPanel.getByLabel('Seconds for set 1')).toBeVisible();
    await expect(plankPanel.getByRole('button', { name: /RIR for set 1/u })).toHaveCount(0);

    await page.setViewportSize({ width: 430, height: 1000 });
    await page.evaluate(() => window.localStorage.setItem('pulse-theme', 'midnight'));
    await page.reload({ waitUntil: 'networkidle' });
    await expectTheme(page, 'midnight');
    const midnightBenchPanel = await exercisePanel(page, exerciseNames.bench);
    await expectNoOverflow(page, 430, midnightBenchPanel.locator('[data-slot="set-row"]').first());
    await capture(page, 'rir-active-5-plus-430-midnight.png');

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
    const initialCompletedResponse = await api.get(
      `/api/v1/workout-sessions/${completedSessionId}`,
    );
    const initialCompletedSession = (
      (await initialCompletedResponse.json()) as {
        data: { completedAt: number | null; startedAt: number; status: string };
      }
    ).data;

    let correctionRequestCount = 0;
    page.on('request', (candidate) => {
      if (
        candidate.method() === 'PATCH' &&
        candidate.url().endsWith(`/workout-sessions/${completedSessionId}/corrections`)
      ) {
        correctionRequestCount += 1;
      }
    });
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
    const failedDraftTrigger = page.locator('[data-slot="popover-trigger"]').first();
    await expect(failedDraftTrigger).toHaveAccessibleName(
      /RIR for set 1: No repetitions in reserve logged/u,
    );
    await failedDraftTrigger.click();
    await page.getByRole('radiogroup').getByRole('radio').first().focus();
    await page.keyboard.press('3');
    await expect(failedDraftTrigger).toBeFocused();
    expect(correctionRequestCount).toBe(0);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Failed to save corrections. Please try again.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await expect(
      page.getByRole('button', { name: /RIR for set 1: 3 repetitions in reserve/u }),
    ).toBeVisible();
    expect(correctionRequestCount).toBe(1);
    const afterFailedCorrection = await api.get(`/api/v1/workout-sessions/${completedSessionId}`);
    expect(afterFailedCorrection.ok(), await afterFailedCorrection.text()).toBeTruthy();
    const failedSet = (
      (await afterFailedCorrection.json()) as {
        data: { sets: Array<{ id: string; rir?: number; rpe?: number }> };
      }
    ).data.sets.find((set) => set.id === completedLegacySetId);
    expect(failedSet).toMatchObject({ rpe: 8 });
    expect(failedSet).not.toHaveProperty('rir');

    const retainedDraftRetry = page.waitForRequest(
      (candidate) =>
        candidate.url().endsWith(`/workout-sessions/${completedSessionId}/corrections`) &&
        candidate.method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Save' }).click();
    expect((await retainedDraftRetry).postDataJSON()).toEqual({
      corrections: [{ setId: completedLegacySetId, rir: 3, rpe: null }],
    });
    expect(correctionRequestCount).toBe(2);
    await expect(page.getByText(/Set 1: 155 lbs × 8 reps \(3 RIR\)/u)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit' }).click();
    const trigger = page.locator('[data-slot="popover-trigger"]').first();
    await expect(trigger).toHaveAccessibleName(/RIR for set 1: 3 repetitions in reserve/u);
    await trigger.click();
    await expect(page.getByText('0 = no reps left · 5+ = five or more reps left')).toBeVisible();
    await expectNoOverflow(page, 430, page.getByRole('dialog'));
    await capture(page, 'rir-correction-picker-430-midnight.png');

    await page.getByRole('radiogroup').getByRole('radio').first().focus();
    await page.keyboard.press('2');
    await expect(trigger).toBeFocused();
    expect(correctionRequestCount).toBe(2);
    const correctionRequest = page.waitForRequest(
      (candidate) =>
        candidate.url().endsWith(`/workout-sessions/${completedSessionId}/corrections`) &&
        candidate.method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Save' }).click();
    const requestPayload = (await correctionRequest).postDataJSON() as unknown;
    expect(requestPayload).toEqual({
      corrections: [{ setId: completedLegacySetId, rir: 2 }],
    });
    expect(correctionRequestCount).toBe(3);
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
    const jwtPayload = (
      (await jwtDetail.json()) as {
        data: { completedAt: number | null; startedAt: number; status: string };
      }
    ).data;
    expect((await agentDetail.json()).data).toEqual(jwtPayload);
    expect({
      completedAt: jwtPayload.completedAt,
      startedAt: jwtPayload.startedAt,
      status: jwtPayload.status,
    }).toEqual({
      completedAt: initialCompletedSession.completedAt,
      startedAt: initialCompletedSession.startedAt,
      status: initialCompletedSession.status,
    });
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
