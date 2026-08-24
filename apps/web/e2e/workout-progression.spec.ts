import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'America/Detroit' });

const password = 'adaptive-preview-only';
const fixtures = {
  accept: 'adaptive-preview-wp-accept',
  edit: 'adaptive-preview-wp-edit',
  stale: 'adaptive-preview-wp-stale',
  agent: 'adaptive-preview-wp-agent',
  muscle: 'adaptive-preview-muscle',
} as const;

type Fixture = keyof typeof fixtures;
type PreviewPayload = {
  recommendations: Array<{
    id: string;
    state: string;
    sourceFingerprint: string;
    decision: string;
    confidence: string;
    facts: string[];
    evidence: {
      sourceSessionId: string | null;
      performance: Array<{
        setId: string;
        weight: number | null;
        reps: number | null;
        rpe: number | null;
        prescribed: { weight: number | null; repsMin: number | null; repsMax: number | null };
      }>;
      priorTargets: Array<{
        weight: number | null;
        repsMin: number | null;
        repsMax: number | null;
      }>;
    };
    recommendedTargets: Array<{ weight: number | null }>;
  }>;
};

let api: APIRequestContext;
const tokens = new Map<Fixture, string>();
let agentToken: { id: string; token: string } | undefined;

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
  const directory = resolve(process.cwd(), '../../artifacts/issue-112');
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ fullPage: true, path: resolve(directory, filename) });
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
  const featureControls = page.getByRole('button', {
    name: /^(Accept targets|Edit|Keep current|Hold with reason|Recompute workout progression|7D|30D|90D|Chest|Triceps)/u,
  });
  for (const button of await featureControls.all()) {
    const box = await button.boundingBox();
    if (!box || box.x + box.width < 0 || box.x > width) continue;
    expect(
      box.height,
      `${width}px ${await button.textContent()} touch target`,
    ).toBeGreaterThanOrEqual(44);
  }
}

async function scheduledWorkoutId(fixture: Fixture) {
  const token = tokens.get(fixture);
  if (!token) throw new Error(`Missing ${fixture} token`);
  const today = dateKeyInDetroit();
  const response = await api.get(
    `/api/v1/scheduled-workouts?from=${addDays(today, -2)}&to=${addDays(today, 2)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  expect(response.ok(), `${fixture} scheduled workout`).toBeTruthy();
  const payload = (await response.json()) as { data: Array<{ id: string }> };
  expect(payload.data).toHaveLength(1);
  return payload.data[0]?.id ?? '';
}

async function preview(fixture: Fixture, authorization?: string) {
  const token = tokens.get(fixture);
  if (!token) throw new Error(`Missing ${fixture} token`);
  const scheduledWorkoutIdValue = await scheduledWorkoutId(fixture);
  const response = await api.post('/api/v1/workout-progression/preview', {
    data: { scheduledWorkoutId: scheduledWorkoutIdValue },
    headers: { authorization: authorization ?? `Bearer ${token}` },
  });
  expect(response.ok(), `${fixture} progression preview`).toBeTruthy();
  return {
    data: ((await response.json()) as { data: PreviewPayload }).data,
    scheduledWorkoutId: scheduledWorkoutIdValue,
  };
}

async function openPlanning(page: Page, fixture: Fixture, width: number) {
  const token = tokens.get(fixture);
  if (!token) throw new Error(`Missing ${fixture} token`);
  const id = await scheduledWorkoutId(fixture);
  await page.setViewportSize({ width, height: 1000 });
  await setAuthenticatedSession(page, token);
  const progressionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/workout-progression/preview') && response.status() === 200,
  );
  await page.goto(`/workouts/scheduled/${id}`, { waitUntil: 'domcontentloaded' });
  const response = await progressionResponse;
  const payload = (await response.json()) as { data: PreviewPayload };
  await expect(page.getByRole('heading', { name: 'Progression review' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  return { id, progression: payload.data };
}

test.describe.serial('Workout progression and muscle analytics', () => {
  test.beforeAll(async () => {
    api = await request.newContext({ baseURL: apiBaseURL });
    for (const fixture of Object.keys(fixtures) as Fixture[]) {
      const response = await api.post('/api/v1/auth/login', {
        data: { username: fixtures[fixture], password },
      });
      expect(response.ok(), `${fixture} login`).toBeTruthy();
      tokens.set(fixture, ((await response.json()) as { data: { token: string } }).data.token);
    }
    const token = tokens.get('agent');
    if (!token) throw new Error('Missing agent fixture token');
    const response = await api.post('/api/v1/agent-tokens', {
      data: { name: 'Workout progression browser agent' },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status(), await response.text()).toBe(201);
    agentToken = ((await response.json()) as { data: { id: string; token: string } }).data;
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('requires explicit acceptance and carries accepted targets into the active session', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    const { id, progression } = await openPlanning(page, 'accept', 390);
    const recommendation = progression.recommendations[0];
    expect(recommendation).toMatchObject({ decision: 'increase', confidence: 'supported' });
    expect(recommendation?.evidence.priorTargets.map((target) => target.weight)).toEqual([40, 40]);
    expect(recommendation?.evidence.performance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prescribed: expect.objectContaining({ weight: 40, repsMin: 8, repsMax: 10 }),
          reps: 10,
          rpe: 8,
          weight: 40,
        }),
      ]),
    );
    expect(recommendation?.recommendedTargets.map((target) => target.weight)).toEqual([45, 45]);
    await expect(page.getByText(recommendation?.facts[0] ?? '')).toBeVisible();
    const comparison = page.getByRole('table', {
      name: 'Incline dumbbell press exact progression comparison',
    });
    await expect(comparison).toBeVisible();
    await expect(
      comparison.getByRole('columnheader', { name: 'Previous prescription' }),
    ).toBeVisible();
    await expect(
      comparison.getByRole('columnheader', { name: 'Completed performance' }),
    ).toBeVisible();
    await expect(comparison.getByRole('columnheader', { name: 'Current plan' })).toBeVisible();
    await expect(comparison.getByRole('columnheader', { name: 'Proposed target' })).toBeVisible();
    const firstSet = comparison.getByRole('row', { name: /^Set 1 /u });
    await expect(firstSet).toContainText('40 lbs · 8–10 reps');
    await expect(firstSet).toContainText('40 lbs · 10 reps · RPE 8');
    await expect(firstSet).toContainText('45 lbs · 8–10 reps');
    await expect(page.getByText(/Policy source: Preview user · revision 1/u)).toBeVisible();

    const before = await api.get(`/api/v1/scheduled-workouts/${id}`, {
      headers: { authorization: `Bearer ${tokens.get('accept')}` },
    });
    const beforePayload = (await before.json()) as {
      data: { exercises: Array<{ sets: Array<{ targetWeight: number | null }> }> };
    };
    expect(beforePayload.data.exercises[0]?.sets.map((set) => set.targetWeight)).toEqual([40, 40]);

    const accepted = page.waitForResponse(
      (response) =>
        response.url().includes('/workout-progression/recommendations/') &&
        response.url().endsWith('/actions') &&
        response.status() === 200,
    );
    await page.getByRole('button', { name: 'Accept targets' }).focus();
    await page.keyboard.press('Enter');
    await accepted;
    await expect(page.getByText('Incline dumbbell press targets accepted.')).toBeVisible();
    await expect(page.getByText('Decision recorded: accepted.')).toBeVisible();

    await expectNoOverflow(page, 390);
    await capture(page, 'progression-accepted-390.png');

    await page.getByRole('button', { name: 'Start workout' }).click();
    const earlyDialog = page.getByRole('alertdialog', { name: 'Start workout early?' });
    if (await earlyDialog.isVisible()) {
      await earlyDialog.getByRole('button', { name: 'Start now' }).click();
    }
    await expect(page).toHaveURL(/\/workouts\/active/u);
    const exerciseToggle = page.getByRole('button', {
      name: /In-progress exercise Incline dumbbell press/u,
    });
    await expect(exerciseToggle).toHaveAttribute('aria-expanded', 'false');
    await exerciseToggle.focus();
    await page.keyboard.press('Enter');
    await expect(exerciseToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('Weight for set 1')).toHaveValue('');
    await expect(page.getByText('Target: 45 lbs').first()).toBeVisible();
    await expect(page.getByText('History', { exact: true })).toBeVisible();
    await expect(page.getByText(/^Aug \d{1,2} · 40x10, 40x10$/u)).toBeVisible();
    await page.waitForLoadState('networkidle');
    diagnostics();
  });

  test('applies a bounded edit while preserving the immutable recommendation', async ({ page }) => {
    const diagnostics = monitorPage(page);
    const { id, progression } = await openPlanning(page, 'edit', 430);
    const originalId = progression.recommendations[0]?.id;
    await page.getByRole('button', { name: 'Edit' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Edit proposed targets' });
    await expect(dialog).toBeVisible();
    const weightInputs = dialog.getByLabel('Weight (lbs)');
    await weightInputs.nth(0).fill('42.5');
    await weightInputs.nth(1).fill('42.5');
    await capture(page, 'progression-edit-430.png');
    const actionResponse = page.waitForResponse(
      (response) => response.url().endsWith('/actions') && response.status() === 200,
    );
    await dialog.getByRole('button', { name: 'Apply edited targets' }).click();
    await actionResponse;
    await expect(page.getByText('Incline dumbbell press edited targets applied.')).toBeVisible();

    const detail = await api.get(`/api/v1/scheduled-workouts/${id}`, {
      headers: { authorization: `Bearer ${tokens.get('edit')}` },
    });
    const detailPayload = (await detail.json()) as {
      data: { exercises: Array<{ sets: Array<{ targetWeight: number | null }> }> };
    };
    expect(detailPayload.data.exercises[0]?.sets.map((set) => set.targetWeight)).toEqual([
      42.5, 42.5,
    ]);
    const immutable = await api.get(`/api/v1/workout-progression/recommendations/${originalId}`, {
      headers: { authorization: `Bearer ${tokens.get('edit')}` },
    });
    expect(((await immutable.json()) as { data: { state: string } }).data.state).toBe('edited');
    await page.waitForLoadState('networkidle');
    diagnostics();
  });

  test('stales corrected evidence and renders the deterministic replacement', async ({ page }) => {
    const diagnostics = monitorPage(page);
    const initial = await preview('stale');
    const old = initial.data.recommendations[0];
    expect(old).toBeDefined();
    const correction = await api.patch(
      `/api/v1/workout-sessions/${old?.evidence.sourceSessionId}/corrections`,
      {
        data: { corrections: [{ setId: old?.evidence.performance[1]?.setId, reps: 7 }] },
        headers: { authorization: `Bearer ${tokens.get('stale')}` },
      },
    );
    expect(correction.ok(), await correction.text()).toBeTruthy();
    const rejected = await api.post(
      `/api/v1/workout-progression/recommendations/${old?.id}/actions`,
      {
        data: {
          action: 'accept',
          editedTargets: null,
          expectedFingerprint: old?.sourceFingerprint,
          idempotencyKey: 'stale-browser-accept',
          reason: null,
        },
        headers: { authorization: `Bearer ${tokens.get('stale')}` },
      },
    );
    expect(rejected.status()).toBe(409);
    expect((await rejected.json()).error.code).toBe('WORKOUT_PROGRESSION_STALE');
    const oldDetail = await api.get(`/api/v1/workout-progression/recommendations/${old?.id}`, {
      headers: { authorization: `Bearer ${tokens.get('stale')}` },
    });
    expect(((await oldDetail.json()) as { data: { state: string } }).data.state).toBe('stale');

    const { progression } = await openPlanning(page, 'stale', 320);
    expect(progression.recommendations[0]).toMatchObject({ decision: 'hold', state: 'current' });
    expect(progression.recommendations[0]?.id).not.toBe(old?.id);
    await expect(page.getByText('Hold', { exact: true })).toBeVisible();
    await expect(page.getByText(progression.recommendations[0]?.facts[0] ?? '')).toBeVisible();
    await expectNoOverflow(page, 320);
    await capture(page, 'progression-stale-320.png');
    diagnostics();
  });

  test('keeps AgentToken reads equal and accepted replay idempotent', async () => {
    if (!agentToken) throw new Error('Missing progression AgentToken');
    const jwt = await preview('agent');
    const agent = await preview('agent', `AgentToken ${agentToken.token}`);
    expect(agent.data).toEqual(jwt.data);
    const recommendation = agent.data.recommendations[0];
    const body = {
      action: 'accept',
      editedTargets: null,
      expectedFingerprint: recommendation?.sourceFingerprint,
      idempotencyKey: 'agent-progression-replay-1',
      reason: null,
    };
    const url = `/api/v1/workout-progression/recommendations/${recommendation?.id}/actions`;
    const first = await api.post(url, {
      data: body,
      headers: { authorization: `AgentToken ${agentToken.token}` },
    });
    const replay = await api.post(url, {
      data: body,
      headers: { authorization: `AgentToken ${agentToken.token}` },
    });
    expect(first.ok(), await first.text()).toBeTruthy();
    expect(replay.ok(), await replay.text()).toBeTruthy();
    expect(await replay.json()).toEqual(await first.json());
    const [jwtDetail, agentDetail] = await Promise.all([
      api.get(`/api/v1/workout-progression/recommendations/${recommendation?.id}`, {
        headers: { authorization: `Bearer ${tokens.get('agent')}` },
      }),
      api.get(`/api/v1/workout-progression/recommendations/${recommendation?.id}`, {
        headers: { authorization: `AgentToken ${agentToken.token}` },
      }),
    ]);
    expect((await agentDetail.json()).data).toEqual((await jwtDetail.json()).data);
  });

  test('traces planned and completed muscle exposure across ranges and exact sources', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    const token = tokens.get('muscle');
    if (!token) throw new Error('Missing muscle fixture token');
    await page.setViewportSize({ width: 1280, height: 1000 });
    await setAuthenticatedSession(page, token);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/workout-progression/muscles?') &&
        response.status() === 200,
    );
    await page.goto('/workouts?view=muscles', { waitUntil: 'domcontentloaded' });
    const response = await responsePromise;
    const analytics = (await response.json()) as {
      data: {
        contributionVersion: number;
        qualifyingSetPolicyVersion: number;
        rows: Array<{
          muscle: string;
          qualifyingSetEquivalents: number;
          plannedSetEquivalents: number;
          fulfilledPlannedSetEquivalents: number;
          exposureState: string;
        }>;
      };
    };
    await expect(page.getByRole('heading', { name: 'Muscle coverage' })).toBeVisible();
    expect(analytics.data.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exposureState: 'fully_completed',
          fulfilledPlannedSetEquivalents: 2,
          muscle: 'Chest',
          plannedSetEquivalents: 2,
          qualifyingSetEquivalents: 2,
        }),
        expect.objectContaining({
          muscle: 'Triceps',
          plannedSetEquivalents: 1,
          qualifyingSetEquivalents: 1,
        }),
      ]),
    );
    await expect(page.getByRole('button', { name: /Chest/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText('contribution policy v1')).toBeVisible();
    await expect(page.getByText('qualifying-set policy v1')).toBeVisible();
    await expect(
      page.getByText(/Only completions linked to an exact scheduled set/u),
    ).toBeVisible();
    await expect(page.getByText(/2 linked equivalents fulfilled/u).first()).toBeVisible();
    await expect(page.getByText(/The source list is complete for this interval/u)).toBeVisible();
    await expect(page.getByText(/primary 1 · completed/u).first()).toBeVisible();
    await page.getByRole('button', { name: /Triceps/u }).click();
    await expect(page.getByText(/secondary 0.5 · completed/u).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'View source' }).first()).toHaveAttribute(
      'href',
      /\/workouts\/session\//u,
    );
    await page.getByRole('button', { name: /Chest/u }).click();

    const exactValues = page.getByText('View exact muscle exposure', { exact: true });
    await exactValues.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('table', { name: /Exact Chest muscle exposure/u })).toBeVisible();
    const firstRowButton = page.getByRole('button', { name: /Inspect Chest on/u }).first();
    await firstRowButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/completed · .* planned set equivalents/u)).toBeVisible();

    const rangeResponse = page.waitForResponse(
      (next) => next.url().includes('range=7d') && next.status() === 200,
    );
    await page.getByRole('button', { name: '7D' }).focus();
    await page.keyboard.press('Space');
    await rangeResponse;
    await expect(page.getByRole('button', { name: '7D' })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForLoadState('networkidle');

    for (const width of [320, 390, 430, 1280]) {
      await expectNoOverflow(page, width);
      if (width === 430 || width === 1280) {
        await capture(page, `muscle-analytics-${width}.png`);
      }
    }
    diagnostics();
  });
});
