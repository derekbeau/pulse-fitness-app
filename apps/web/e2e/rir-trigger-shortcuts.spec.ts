import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type Locator } from '@playwright/test';
import type { WorkoutSession } from '@pulse/shared';

import { setAuthenticatedSession } from './auth-session';
import { RIR_TRIGGER_API, seedRirTriggerFixture } from './rir-trigger-fixture';
import { apiBaseURL } from './test-env';

test.skip(apiBaseURL !== RIR_TRIGGER_API, 'Requires dedicated disposable issue-155 services');
const evidence = resolve(__dirname, '../../..', 'artifacts/issue-155');
const database = resolve(__dirname, '../../..', 'data/issue-155/browser.db');

function rawSets(sessionId: string): Array<Record<string, unknown>> {
  if (process.env.E2E_DATABASE_URL !== database || !/^[\da-f-]{36}$/u.test(sessionId)) {
    throw new Error('Raw readback requires the isolated issue-155 database and fixture UUID');
  }
  return JSON.parse(
    execFileSync(
      'sqlite3',
      [
        '-readonly',
        '-json',
        database,
        `SELECT * FROM session_sets WHERE session_id = '${sessionId}' ORDER BY id`,
      ],
      { encoding: 'utf8' },
    ),
  );
}
function requireSet(session: WorkoutSession, exerciseId: string, setNumber: number) {
  const set = session.sets.find(
    (candidate) => candidate.exerciseId === exerciseId && candidate.setNumber === setNumber,
  );
  if (!set) throw new Error('Missing fixture set');
  return set;
}
async function panel(page: Page, name: string) {
  const toggle = page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) })
    .first();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const id = await toggle.getAttribute('aria-controls');
  expect(id).toBeTruthy();
  return page.locator(`[id="${id}"]`);
}
function monitor(page: Page) {
  const errors: string[] = [];
  const requests: Array<{ path: string; body: unknown }> = [];
  const responses: Array<{ method: string; path: string; status: number }> = [];
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) =>
    errors.push(
      `${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
    ),
  );
  page.on('request', (request) => {
    if (request.method() === 'PATCH')
      requests.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/')) {
      responses.push({
        method: response.request().method(),
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
      if (response.status() >= 400)
        errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  return { errors, requests, responses };
}
async function capture(page: Page, name: string) {
  await page.screenshot({ path: resolve(evidence, `${name}.png`) });
}
async function unchangedLifecycle(
  fixture: Awaited<ReturnType<typeof seedRirTriggerFixture>>,
  before: WorkoutSession,
) {
  const after = await fixture.api<WorkoutSession>(`/workout-sessions/${before.id}`);
  for (const field of [
    'status',
    'startedAt',
    'completedAt',
    'createdAt',
    'timeSegments',
  ] as const) {
    expect(after[field]).toEqual(before[field]);
  }
  return after;
}

test('desktop Tab shortcuts persist once for every consumer and preserve raw set facts', async ({
  page,
}) => {
  const fixture = await seedRirTriggerFixture(apiBaseURL);
  mkdirSync(evidence, { recursive: true });
  const diagnostics = monitor(page);
  const activeBefore = rawSets(fixture.active.id);
  const completedBefore = rawSets(fixture.completed.id);
  await page.setViewportSize({ width: 1280, height: 900 });
  await setAuthenticatedSession(page, fixture.token);
  await page.goto(`/workouts/active?sessionId=${fixture.active.id}`);
  const bench = await panel(page, fixture.exercises[0].name);
  const trigger = bench.getByRole('button', { name: /RIR for set 1:/u });
  // Focus the preceding actual input, then use real browser Tab (no synthetic keydown).
  await bench.getByLabel('Reps for set 1').focus();
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await expect(page.getByText('Keys 0–5', { exact: true }).filter({ visible: true })).toHaveCount(
    1,
  );
  await capture(page, 'desktop-tab-hint');
  const firstSet = requireSet(fixture.active, fixture.exercises[0].id, 1);
  const selectedRir = new Map<string, number>();
  async function select(closedTrigger: Locator, key: string, setId: string) {
    const count = diagnostics.requests.length;
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/sets/${setId}`) && response.request().method() === 'PATCH',
    );
    // Playwright maps physical Numpad5 to Clear without NumLock. Test the contract's
    // keypad case explicitly: a numpad event that emits the same unmodified key "5".
    if (key === 'Numpad5')
      await closedTrigger.dispatchEvent('keydown', { key: '5', code: 'Numpad5' });
    else await closedTrigger.press(key);
    expect((await saved).status()).toBe(200);
    selectedRir.set(setId, Number(key === 'Numpad5' ? '5' : key));
    await expect(closedTrigger).toBeFocused();
    await expect(page.getByRole('radiogroup')).toHaveCount(0);
    expect(diagnostics.requests).toHaveLength(count + 1);
    expect(diagnostics.requests.at(-1)?.body).toMatchObject({
      rir: Number(key === 'Numpad5' ? '5' : key),
      rpe: null,
    });
  }
  await select(trigger, '2', firstSet.id);
  await capture(page, 'desktop-closed-two');
  await page.keyboard.press('Tab');
  await expect(bench.getByLabel('Weight for set 2')).toBeFocused();
  for (const digit of ['0', '1', '3', '4', '5', '4', 'Numpad5'])
    await select(trigger, digit, firstSet.id);
  await expect(trigger).toHaveText('5+ RIR');
  const count = diagnostics.requests.length;
  for (const key of ['6', '7', '8', '9', 'Shift+2', 'Control+2', 'Alt+2', 'Meta+2'])
    await trigger.press(key);
  await trigger.dispatchEvent('keydown', { key: '2', repeat: true });
  await trigger.dispatchEvent('keydown', { key: '2', isComposing: true });
  const altGraphActive = await trigger.evaluate((element) => {
    const event = new KeyboardEvent('keydown', { key: '2', bubbles: true, modifierAltGraph: true });
    const active = event.getModifierState('AltGraph');
    element.dispatchEvent(event);
    return active;
  });
  expect(altGraphActive).toBe(true);
  expect(diagnostics.requests).toHaveLength(count);
  await expect(trigger).toHaveText('5+ RIR');
  await expect(page.getByRole('radiogroup')).toHaveCount(0);

  for (const openKey of ['Enter', 'Space']) {
    await trigger.press(openKey);
    await expect(page.getByRole('radiogroup')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('radiogroup')).toHaveCount(0);
  }
  expect(diagnostics.requests).toHaveLength(count);
  // Every supported tracking mode, plus an already-complete active set.
  for (const exercise of fixture.exercises.slice(0, 3)) {
    const area = await panel(page, exercise.name);
    const setNumber = exercise === fixture.exercises[0] ? 2 : 1;
    const set = requireSet(fixture.active, exercise.id, setNumber);
    await select(
      area.getByRole('button', { name: new RegExp(`RIR for set ${setNumber}:`, 'u') }),
      '2',
      set.id,
    );
  }
  const walk = await panel(page, fixture.exercises[3].name);
  await expect(walk.getByRole('button', { name: /RIR for set/u })).toHaveCount(0);
  const activeAfter = rawSets(fixture.active.id);
  expect(activeAfter).toEqual(
    activeBefore.map((set) =>
      selectedRir.has(String(set.id))
        ? { ...set, rir: selectedRir.get(String(set.id)), rpe: null }
        : set,
    ),
  );
  expect(activeAfter.find((set) => set.id === firstSet.id)).toMatchObject({
    rir: 5,
    rpe: null,
    completed: 0,
  });
  const activeApi = await unchangedLifecycle(fixture, fixture.active);
  await page.reload();
  await expect(
    (await panel(page, fixture.exercises[0].name)).getByRole('button', {
      name: /RIR for set 1: 5 or more/u,
    }),
  ).toHaveText('5+ RIR');

  await page.goto(`/workouts/session/${fixture.completed.id}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const correction = page
    .getByTestId(`workout-exercise-card-${fixture.exercises[0].id}`)
    .getByRole('button', {
      name: /RIR for set 1:/u,
    });
  const beforeDraft = diagnostics.requests.length;
  // The correction trigger follows the final metric field. Tab through the real editor.
  await correction.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(correction).toBeFocused();
  await page.keyboard.press('2');
  await expect(correction).toHaveText('2 RIR');
  await expect(correction).toBeFocused();
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
  expect(diagnostics.requests).toHaveLength(beforeDraft);
  for (const exercise of fixture.exercises.slice(1, 3)) {
    const editor = page.getByTestId(`workout-exercise-card-${exercise.id}`);
    await editor.getByRole('button', { name: /RIR for set 1:/u }).press('0');
  }
  expect(diagnostics.requests).toHaveLength(beforeDraft);
  await capture(page, 'desktop-correction-draft');
  const save = page.waitForResponse(
    (response) =>
      response.url().endsWith('/corrections') && response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await save).status()).toBe(200);
  expect(diagnostics.requests).toHaveLength(beforeDraft + 1);
  expect(diagnostics.requests.at(-1)?.body).toEqual({
    corrections: fixture.exercises.slice(0, 3).map((exercise, index) => ({
      setId: requireSet(fixture.completed, exercise.id, 1).id,
      rir: index === 0 ? 2 : 0,
      rpe: null,
    })),
  });
  await page.reload();
  await expect(page.getByText('Set 1: 135 lbs × 8 reps (2 RIR)', { exact: true })).toBeVisible();
  const completedAfter = rawSets(fixture.completed.id);
  expect(completedAfter).toEqual(
    completedBefore.map((set) => {
      const exerciseIndex = fixture.exercises
        .slice(0, 3)
        .findIndex((exercise) => exercise.id === set.exercise_id);
      return exerciseIndex >= 0 && set.set_number === 1
        ? { ...set, rir: exerciseIndex === 0 ? 2 : 0, rpe: null }
        : set;
    }),
  );
  for (const exercise of fixture.exercises.slice(0, 3)) {
    expect(
      completedAfter.find((set) => set.exercise_id === exercise.id && set.set_number === 1),
    ).toMatchObject({ rir: exercise === fixture.exercises[0] ? 2 : 0, rpe: null });
  }
  const completedApi = await unchangedLifecycle(fixture, fixture.completed);
  await capture(page, 'desktop-correction-reloaded');
  expect(diagnostics.errors).toEqual([]);
  writeFileSync(
    resolve(evidence, 'desktop-readback.json'),
    JSON.stringify(
      {
        ...diagnostics,
        altGraphActive,
        activeBefore,
        activeAfter,
        activeApi,
        completedBefore,
        completedAfter,
        completedApi,
      },
      null,
      2,
    ),
  );
});

test.describe('mobile touch', () => {
  test.use({ viewport: { width: 375, height: 900 }, isMobile: true, hasTouch: true });
  test('touch selects zero and 5+, Clear and focus return survive reload', async ({ page }) => {
    const fixture = await seedRirTriggerFixture(apiBaseURL);
    const diagnostics = monitor(page);
    const before = rawSets(fixture.active.id);
    await setAuthenticatedSession(page, fixture.token);
    await page.goto(`/workouts/active?sessionId=${fixture.active.id}`);
    const bench = await panel(page, fixture.exercises[0].name);
    const trigger = bench.getByRole('button', { name: /RIR for set 1:/u });
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
    for (const [label, value] of [
      ['0 repetitions in reserve', 0],
      ['5 or more repetitions in reserve', 5],
      ['Clear repetitions in reserve', null],
      ['5 or more repetitions in reserve', 5],
    ] as const) {
      await trigger.tap();
      const option = page.getByRole('radio', { name: label, exact: true });
      await expect(option).toBeVisible();
      const box = await option.boundingBox();
      if (!box) throw new Error('Missing touch option bounds');
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      await capture(page, `mobile-picker-${value ?? 'clear'}`);
      const saved = page.waitForResponse(
        (response) => response.request().method() === 'PATCH' && response.url().includes('/sets/'),
      );
      await option.tap();
      expect((await saved).status()).toBe(200);
      await expect(trigger).toBeFocused();
      await expect(page.getByRole('radiogroup')).toHaveCount(0);
      expect(diagnostics.requests.at(-1)?.body).toMatchObject({
        rir: value,
        rpe: null,
        completed: false,
      });
    }
    expect(diagnostics.requests).toHaveLength(4);
    await page.reload();
    await expect(
      (await panel(page, fixture.exercises[0].name)).getByRole('button', {
        name: /RIR for set 1: 5 or more/u,
      }),
    ).toHaveText('5+ RIR');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const after = rawSets(fixture.active.id);
    expect(after).toEqual(
      before.map((set) =>
        set.exercise_id === fixture.exercises[0].id && set.set_number === 1
          ? { ...set, rir: 5, rpe: null }
          : set,
      ),
    );
    expect(diagnostics.errors).toEqual([]);
    await (await panel(page, fixture.exercises[0].name))
      .getByRole('button', { name: /RIR for set 1: 5 or more/u })
      .scrollIntoViewIfNeeded();
    await capture(page, 'mobile-touch-reloaded');
    writeFileSync(
      resolve(evidence, 'mobile-readback.json'),
      JSON.stringify({ ...diagnostics, before, after }, null, 2),
    );
  });
});
