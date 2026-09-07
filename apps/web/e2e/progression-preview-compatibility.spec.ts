import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'America/Detroit' });

const username = 'adaptive-preview-wp-accept';
const password = 'adaptive-preview-only';
const scheduledDate = '2026-08-24';
const repoRoot = resolve(__dirname, '../../..');
const artifactDirectory = resolve(repoRoot, 'logs/progression-preview/chrome');

type Target = {
  setId: string;
  setNumber: number;
  reps: number | null;
  repsMin: number | null;
  repsMax: number | null;
  [key: string]: unknown;
};

type Performance = {
  setId: string;
  setNumber: number;
  prescribed: Target;
  [key: string]: unknown;
};

type Recommendation = {
  evidence: {
    priorTargets: Target[];
    performance: Performance[];
    policy: Record<string, unknown>;
    policySource: Record<string, unknown>;
    [key: string]: unknown;
  };
  recommendedTargets: Target[];
  [key: string]: unknown;
};

type PreviewPayload = { recommendations: Recommendation[] };

let api: APIRequestContext;
let token: string;
let scheduledWorkoutId: string;

function gitMetadata() {
  return {
    commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
    workingTreeDirty:
      execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
  };
}

async function writeScreenshot(page: Page, name: string, viewport: number, phase: string) {
  mkdirSync(artifactDirectory, { recursive: true });
  const filename = `${name}-${viewport}.png`;
  await page.screenshot({ fullPage: true, path: resolve(artifactDirectory, filename) });
  writeFileSync(
    resolve(artifactDirectory, `${name}-${viewport}.json`),
    `${JSON.stringify(
      {
        ...gitMetadata(),
        fixture: 'adaptive-preview-wp-accept plus isolated browser response scenario',
        scenario: name,
        viewport: { width: viewport, height: 1000 },
        phase,
        screenshot: filename,
      },
      null,
      2,
    )}\n`,
  );
}

async function loginAndFindWorkout() {
  const login = await api.post('/api/v1/auth/login', { data: { username, password } });
  expect(login.ok(), await login.text()).toBeTruthy();
  token = ((await login.json()) as { data: { token: string } }).data.token;
  const workouts = await api.get(
    `/api/v1/scheduled-workouts?from=${scheduledDate}&to=${scheduledDate}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  expect(workouts.ok(), await workouts.text()).toBeTruthy();
  const data = (await workouts.json()) as { data: Array<{ id: string }> };
  expect(data.data).toHaveLength(1);
  scheduledWorkoutId = data.data[0]?.id ?? '';
  expect(scheduledWorkoutId).toBeTruthy();
}

function injectPersistedLegacyTargets(repsMin: 6 | 8 = 8) {
  const configuredDatabase = process.env.E2E_DATABASE_URL;
  if (!configuredDatabase) throw new Error('Explicit isolated E2E_DATABASE_URL required');
  const database = resolve(process.cwd(), configuredDatabase);
  const allowedNames = new Set(['pulse-tdee-dev.db', 'pulse-e2e.db', 'pulse-progression-e2e.db']);
  if (
    !allowedNames.has(database.split('/').pop() ?? '') ||
    !database.startsWith(`${repoRoot}/`) ||
    lstatSync(database).isSymbolicLink() ||
    realpathSync(database) !== database
  ) {
    throw new Error(
      `Refusing legacy fixture injection outside an isolated E2E database: ${database}`,
    );
  }
  const sql = `
    UPDATE scheduled_workout_exercise_sets
    SET reps = 8, reps_min = ${repsMin}, reps_max = 8
    WHERE scheduled_workout_exercise_id IN (
      SELECT swe.id
      FROM scheduled_workout_exercises swe
      JOIN scheduled_workouts sw ON sw.id = swe.scheduled_workout_id
      JOIN users u ON u.id = sw.user_id
      WHERE u.username = '${username}' AND sw.date = '${scheduledDate}'
    );
    UPDATE session_sets
    SET target_reps = 8, target_reps_min = 8, target_reps_max = 8
    WHERE session_id IN (
      SELECT ws.id
      FROM workout_sessions ws
      JOIN users u ON u.id = ws.user_id
      WHERE u.username = '${username}'
    );
  `;
  execFileSync('sqlite3', [database, sql], { encoding: 'utf8' });
}

async function scheduledTargets() {
  const response = await api.get(`/api/v1/scheduled-workouts/${scheduledWorkoutId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = (await response.json()) as {
    data: { exercises: Array<{ sets: Array<Record<string, unknown>> }> };
  };
  return payload.data.exercises.flatMap((exercise) => exercise.sets);
}

async function openReview(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await setAuthenticatedSession(page, token);
  await page.goto(`/workouts/scheduled/${scheduledWorkoutId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Progression review' })).toBeVisible();
}

async function basePreviewWithScenario(
  page: Page,
  scenario: (payload: PreviewPayload) => PreviewPayload,
) {
  await page.route('**/api/v1/workout-progression/preview', async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as { data: PreviewPayload };
    await route.fulfill({
      response,
      body: JSON.stringify({ data: scenario(payload.data) }),
      contentType: 'application/json',
    });
  });
}

function noPolicyResponse(payload: PreviewPayload): PreviewPayload {
  const recommendation = payload.recommendations[0];
  if (!recommendation) throw new Error('Progression fixture has no recommendation');
  return {
    recommendations: [
      {
        ...recommendation,
        decision: 'hold',
        confidence: 'unavailable',
        reasonCodes: ['MISSING_POLICY'],
        facts: ['No progression policy is configured for this exercise.'],
        evidence: {
          ...recommendation.evidence,
          policy: {
            family: 'unsupported',
            version: 1,
            loadIncrement: null,
            loadIncreasePercent: null,
            repRangeMin: null,
            repRangeMax: null,
            effortCeiling: null,
            lowEffortThreshold: null,
            secondsStep: null,
            distanceStep: null,
            zoneCeiling: null,
            allowReduction: false,
            contextRequired: false,
          },
          policySource: {
            type: 'none',
            configurationId: null,
            revision: 0,
            configuredAt: null,
            actorType: null,
            actorId: null,
            actorLabel: null,
          },
        },
        recommendedTargets: recommendation.evidence.priorTargets,
      },
    ],
  };
}

test.describe.serial('installed Chrome progression preview compatibility', () => {
  test.beforeAll(async () => {
    api = await request.newContext({ baseURL: apiBaseURL });
    injectPersistedLegacyTargets();
    await loginAndFindWorkout();
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('serves a persisted legacy exact plus equal bounds fixture without a 500', async () => {
    const response = await api.post('/api/v1/workout-progression/preview', {
      data: { scheduledWorkoutId },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status(), await response.text()).toBe(200);
    const payload = (await response.json()) as { data: PreviewPayload };
    const recommendation = payload.data.recommendations[0];
    expect(recommendation).toBeDefined();
    expect(recommendation?.evidence.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'REDUNDANT_EXACT_REPS',
          source: 'current_scheduled_target',
        }),
        expect.objectContaining({
          reason: 'REDUNDANT_EXACT_REPS',
          source: 'historical_prescribed_target',
        }),
      ]),
    );
  });

  test('renders legacy exact plus redundant bounds at mobile and desktop widths without changing the plan', async ({
    page,
  }) => {
    const before = await scheduledTargets();

    for (const width of [320, 1280]) {
      await openReview(page, width);
      await expect(page.getByText(/Legacy exact-reps bounds were normalized/u)).toHaveCount(4);
      await expect(page.getByRole('button', { name: 'Accept targets' })).toBeVisible();
      await expect(page.getByText(/Nothing changes until you choose an action/u)).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      for (const button of await page
        .getByRole('button', { name: /^(Accept targets|Edit|Keep current|Hold with reason)$/u })
        .all()) {
        expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
      await writeScreenshot(page, 'legacy-success-pre-action', width, 'pre-action');
      if (width === 320) {
        await page.getByRole('region', { name: /comparison scroll area/u }).evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        await writeScreenshot(page, 'legacy-comparison-right-pre-action', width, 'pre-action');
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    expect(await scheduledTargets()).toEqual(before);
  });

  test('reopening the same plan within the app reuses the preview without a new POST', async ({
    page,
  }) => {
    let requests = 0;
    page.on('request', (requestValue) => {
      if (requestValue.url().endsWith('/workout-progression/preview')) requests += 1;
    });
    const before = await scheduledTargets();
    await openReview(page, 1280);
    await expect(page.getByRole('button', { name: 'Accept targets' })).toBeVisible();
    expect(requests).toBe(1);
    await page.getByRole('link', { name: 'Workouts', exact: true }).first().click();
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Accept targets' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(requests).toBe(1);
    expect(await scheduledTargets()).toEqual(before);
    console.log(
      JSON.stringify({
        ...gitMetadata(),
        scenario: 'SPA-reopen',
        viewport: 1280,
        phase: 'pre-action',
        requests,
        targetsUnchanged: true,
      }),
    );
  });

  test('announces loading while the first preview is pending without changing targets', async ({
    page,
  }) => {
    const before = await scheduledTargets();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    await page.route('**/api/v1/workout-progression/preview', async (route) => {
      await gate;
      await route.continue();
    });
    await openReview(page, 320);
    await expect(
      page.getByRole('status').filter({ hasText: 'Checking prior performance' }),
    ).toBeVisible();
    await writeScreenshot(page, 'loading-pre-action', 320, 'pre-action');
    await page.setViewportSize({ width: 1280, height: 1000 });
    await writeScreenshot(page, 'loading-pre-action', 1280, 'pre-action');
    release?.();
    await expect(page.getByRole('button', { name: 'Accept targets' })).toBeVisible();
    expect(await scheduledTargets()).toEqual(before);
  });

  test('renders no-policy as an unavailable hold with the plan unchanged', async ({ page }) => {
    const before = await scheduledTargets();
    await basePreviewWithScenario(page, noPolicyResponse);
    await openReview(page, 1280);
    await expect(
      page.getByRole('status').filter({ hasText: 'No progression policy' }),
    ).toContainText('No progression policy is configured for this exercise');
    await expect(page.getByRole('button', { name: 'Accept targets' })).toBeDisabled();
    await expect(page.getByText(/The current plan has not changed/u).first()).toBeVisible();
    await writeScreenshot(page, 'missing-policy-unavailable-pre-action', 1280, 'pre-action');
    await page.setViewportSize({ width: 320, height: 1000 });
    await writeScreenshot(page, 'missing-policy-unavailable-pre-action', 320, 'pre-action');
    expect(await scheduledTargets()).toEqual(before);
  });

  test('renders a conflicting legacy target as an unavailable inline diagnostic', async ({
    page,
  }) => {
    injectPersistedLegacyTargets(6);
    const before = await scheduledTargets();
    await openReview(page, 320);
    await expect(page.getByText(/Invalid current scheduled target at set/u).first()).toBeVisible();
    await expect(page.getByText(/Raw values:.*repsMin=6/u).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept targets' })).toBeDisabled();
    await expect(page.getByText(/The current plan has not changed/u).first()).toBeVisible();
    await writeScreenshot(page, 'conflicting-target-unavailable-pre-action', 320, 'pre-action');
    await page.setViewportSize({ width: 1280, height: 1000 });
    await writeScreenshot(page, 'conflicting-target-unavailable-pre-action', 1280, 'pre-action');
    expect(await scheduledTargets()).toEqual(before);
    injectPersistedLegacyTargets();
  });

  test('makes one server request, shows inline retry, and succeeds after explicit retry', async ({
    page,
  }) => {
    let requestCount = 0;
    await page.route('**/api/v1/workout-progression/preview', async (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'PREVIEW_UNAVAILABLE', message: 'fixture failure' },
          }),
        });
        return;
      }
      const response = await route.fetch();
      await route.fulfill({ response });
    });
    await openReview(page, 1280);
    await expect(page.getByRole('alert')).toContainText('Your plan has not changed');
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(requestCount).toBe(1);
    await writeScreenshot(page, 'server-error-pre-retry', 1280, 'pre-retry');
    await page.setViewportSize({ width: 320, height: 1000 });
    await writeScreenshot(page, 'server-error-pre-retry', 320, 'pre-retry');
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.getByRole('button', { name: 'Retry' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Progression review' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept targets' })).toBeVisible();
    expect(requestCount).toBe(2);
    console.log(
      JSON.stringify({
        ...gitMetadata(),
        scenario: 'explicit-retry',
        viewport: 1280,
        phase: 'post-retry-pre-action',
        requestCount,
        assertion: 'one initial failed request plus one explicit retry',
      }),
    );
    await writeScreenshot(page, 'server-error-explicit-retry-post-retry', 1280, 'post-retry');
  });
});
