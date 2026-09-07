import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentTokens, foods, meals, nutritionLogs, users } from '../../db/schema/index.js';
import { createAdaptiveAnalyticsStore } from '../adaptive-nutrition/analytics-store.js';
import { createDataQualityCalendarStore } from '../data-quality/store.js';
import { createAdaptiveNutritionStore } from '../adaptive-nutrition/store.js';
import { createMealForDate } from './store.js';

let app: FastifyInstance;
let database: typeof import('../../db/index.js');
let tempDir: string;
let owner: string;
let stranger: string;
let generation = 0;
let headers: Record<'Bearer' | 'AgentToken' | 'stranger', { authorization: string }>;
const date = '2026-08-20';
const now = '2026-09-07T16:00:00.000Z';

const get = async (path: string, auth = headers.Bearer) => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/nutrition/${path}`,
    headers: auth,
  });
  expect(response.statusCode).toBe(200);
  return response.json().data;
};
const patch = (body: unknown, auth = headers.Bearer, day = date) =>
  app.inject({
    method: 'PATCH',
    url: `/api/v1/nutrition/${day}`,
    headers: auth,
    payload: body as object,
  });
const persistentFacts = () =>
  Object.fromEntries(
    [
      'meals',
      'meal_items',
      'foods',
      'nutrition_targets',
      'nutrition_target_events',
      'body_weight',
      'adaptive_nutrition_programs',
      'adaptive_nutrition_checkins',
    ].map((table) => [table, database.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]),
  );
const makeProgram = () => {
  const store = createAdaptiveNutritionStore({ ...database, now: () => new Date(now) });
  store.upsertProgram(owner, {
    status: 'active',
    timeZone: 'America/Detroit',
    heightCm: null,
    birthDate: null,
    rmrEquation: 'manual_tdee',
    activityLevel: null,
    manualBaselineTdeeKcal: 2500,
    goalType: 'maintain',
    targetWeightKg: null,
    goalRatePctPerWeek: 0,
    proteinGrams: 180,
    fatAllocationPct: 30,
    currentWeight: { weight: 82, unit: 'kg' },
    rebaseline: false,
    supersedePending: false,
  });
  return store;
};

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'pulse-daily-notes-'));
  vi.stubEnv('DATABASE_URL', join(tempDir, 'fictional.db'));
  vi.stubEnv('JWT_SECRET', 'fictional-daily-notes-test-secret');
  vi.stubEnv('PULSE_TEST_NOW', now);
  vi.resetModules();
  database = await import('../../db/index.js');
  migrate(database.db, {
    migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
  });
  app = (await import('../../index.js')).buildServer();
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  database?.sqlite.close();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.resetModules();
});

beforeEach(() => {
  generation += 1;
  owner = `notes-owner-${generation}`;
  stranger = `notes-stranger-${generation}`;
  database.db
    .insert(users)
    .values(
      [owner, stranger].map((id) => ({
        id,
        username: id,
        passwordHash: 'fictional-unused',
        preferences: { timeZone: 'America/Detroit' },
      })),
    )
    .run();
  const token = `fictional-note-agent-${generation}`;
  database.db
    .insert(agentTokens)
    .values({
      id: `notes-agent-${generation}`,
      userId: owner,
      name: 'Fictional note agent',
      tokenHash: createHash('sha256').update(token).digest('hex'),
    })
    .run();
  const bearer = (id: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub: id, type: 'session', iss: 'pulse-api' }, { expiresIn: '1h' })}`,
  });
  headers = {
    Bearer: bearer(owner),
    AgentToken: { authorization: `AgentToken ${token}` },
    stranger: bearer(stranger),
  };
});

describe.each(['Bearer', 'AgentToken'] as const)('%s daily note contract', (mode) => {
  it('creates an empty historical day, trims only edges, replaces, omits, and clears idempotently', async () => {
    expect((await patch({}, headers[mode])).json()).toEqual({ data: null });
    expect((await patch({ notes: null }, headers[mode])).json()).toEqual({ data: null });
    const created = await patch({ notes: '  Restaurant\n  estimated macros  ' }, headers[mode]);
    expect(created.statusCode).toBe(200);
    const first = created.json().data;
    expect(first).toMatchObject({
      log: {
        userId: owner,
        date,
        notes: 'Restaurant\n  estimated macros',
        status: 'unknown',
        statusUpdatedAt: null,
      },
      meals: [],
    });
    expect((await patch({}, headers[mode])).json().data).toEqual(first);
    expect((await patch({ notes: first.log.notes }, headers[mode])).json().data).toEqual(first);
    expect((await patch({ notes: 'Replacement' }, headers[mode])).json().data.log.notes).toBe(
      'Replacement',
    );
    const cleared = (await patch({ notes: null }, headers[mode])).json().data;
    expect(cleared.log.notes).toBeNull();
    expect(cleared.log.updatedAt).toBe(first.log.updatedAt);
    expect((await patch({ notes: null }, headers[mode])).json().data).toEqual(cleared);
    expect(
      database.sqlite
        .prepare('SELECT notes FROM nutrition_logs WHERE user_id = ? AND date = ?')
        .get(owner, date),
    ).toEqual({ notes: null });
  });

  it('has consistent detail, summary, logging context, and compact week notes with user isolation', async () => {
    await patch({ notes: 'Private foreign context' }, headers.stranger);
    const foreignBefore = await get(date, headers.stranger);
    for (const notes of ['Owner context', 'Changed\ncontext', null]) {
      const response = await patch({ notes }, headers[mode]);
      expect(response.statusCode).toBe(200);
      expect(await get(date, headers[mode])).toEqual(response.json().data);
      expect((await get(`${date}/summary`, headers[mode])).notes).toBe(notes);
      const context = await get(`logging-context?date=${date}`, headers[mode]);
      expect(context.today.nutrition.log.notes).toBe(notes);
      expect(context.today.summary.notes).toBe(notes);
      const week = await get(`week-summary?date=${date}T12:00:00.000Z`, headers[mode]);
      expect(week).toHaveLength(7);
      expect(week.find((day: { date: string }) => day.date === date)).toMatchObject({
        hasNote: notes !== null,
        mealCount: 0,
        completeness: 0,
      });
      expect(week.every((day: object) => !('notes' in day))).toBe(true);
      expect(JSON.stringify(response.json())).not.toContain('Private foreign context');
      expect(await get(date, headers.stranger)).toEqual(foreignBefore);
    }
  });

  it('rejects malformed bodies and dates, counts UTF-16 units after trim, and allows valid future notes', async () => {
    for (const body of [
      { notes: '' },
      { notes: ' \n\t ' },
      { notes: 12 },
      { notes: false },
      { notes: [] },
      { notes: 'a'.repeat(2001) },
      { notes: '😀'.repeat(1001) },
      { context: 'alias' },
      { notes: 'valid', userId: stranger },
    ]) {
      const response = await patch(body, headers[mode]);
      expect(response.statusCode, JSON.stringify(body).slice(0, 60)).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    }
    for (const day of ['2026-02-30', '2026-13-01', 'not-a-date', '2026-8-20']) {
      expect((await patch({ notes: 'x' }, headers[mode], day)).statusCode).toBe(400);
    }
    const maximum = await patch({ notes: `  ${'😀'.repeat(1000)}  ` }, headers[mode], '2099-01-01');
    expect(maximum.statusCode).toBe(200);
    expect(maximum.json().data.log.notes.length).toBe(2000);
    expect(maximum.json().data.log.status).toBe('unknown');
  });

  it('preserves all meal, food, target, energy, and adaptive facts on a populated complete day', async () => {
    const store = makeProgram();
    const foodId = `notes-food-${generation}`;
    database.db
      .insert(foods)
      .values({
        id: foodId,
        userId: owner,
        name: 'Fictional grain bowl',
        calories: 600,
        protein: 35,
        carbs: 70,
        fat: 20,
      })
      .run();
    await createMealForDate(owner, date, {
      name: 'Fictional lunch',
      notes: 'Meal-specific note',
      items: [
        {
          foodId,
          name: 'Fictional grain bowl',
          amount: 1,
          unit: 'bowl',
          calories: 600,
          protein: 35,
          carbs: 70,
          fat: 20,
        },
      ],
    });
    const status = await app.inject({
      method: 'PATCH',
      url: `/api/v1/nutrition/${date}/status`,
      headers: headers[mode],
      payload: { status: 'complete' },
    });
    expect(status.statusCode).toBe(200);
    const baseline = store.getState(owner).pendingCheckIn;
    if (!baseline) throw new Error('Expected fixture baseline');
    store.declineCheckIn(owner, baseline.id);
    const preview = store.previewCheckIn(owner, { kind: 'weekly', includeToday: false });
    const facts = persistentFacts();
    const before = await get(date);
    const rawLog = database.sqlite
      .prepare('SELECT * FROM nutrition_logs WHERE user_id = ? AND date = ?')
      .get(owner, date) as Record<string, unknown>;
    const energy = await get(`${date}/energy-adherence`);
    const summary = await get(`${date}/summary`);
    const state = store.getState(owner);
    for (const notes of ['Recovery intake', 'Estimated\nmacros', null]) {
      expect((await patch({ notes }, headers[mode])).statusCode).toBe(200);
      const after = await get(date);
      expect({ ...after, log: { ...after.log, notes: before.log.notes } }).toEqual(before);
      expect(persistentFacts()).toEqual(facts);
      const changedLog = database.sqlite
        .prepare('SELECT * FROM nutrition_logs WHERE user_id = ? AND date = ?')
        .get(owner, date) as Record<string, unknown>;
      expect({ ...changedLog, notes: rawLog.notes }).toEqual(rawLog);
      expect(await get(`${date}/energy-adherence`)).toEqual(energy);
      expect({ ...(await get(`${date}/summary`)), notes: summary.notes }).toEqual(summary);
      expect(store.getState(owner)).toEqual(state);
      expect(store.previewCheckIn(owner, { kind: 'weekly', includeToday: false })).toEqual(preview);
    }
  });

  it('rolls back failed insert and update triggers without partial notes or any integrity side effects', async () => {
    const before = persistentFacts();
    database.sqlite.exec(
      `CREATE TEMP TRIGGER fail_note_insert AFTER INSERT ON nutrition_logs WHEN NEW.user_id = '${owner}' BEGIN SELECT RAISE(ABORT, 'injected note insert failure'); END`,
    );
    try {
      expect((await patch({ notes: 'Must roll back' }, headers[mode])).statusCode).toBe(500);
      expect(await get(date)).toBeNull();
      expect(persistentFacts()).toEqual(before);
    } finally {
      database.sqlite.exec('DROP TRIGGER fail_note_insert');
    }
    await patch({ notes: 'Original' }, headers[mode]);
    const original = await get(date);
    database.sqlite.exec(
      `CREATE TEMP TRIGGER fail_note_update AFTER UPDATE OF notes ON nutrition_logs WHEN NEW.user_id = '${owner}' BEGIN SELECT RAISE(ABORT, 'injected note update failure'); END`,
    );
    try {
      expect((await patch({ notes: 'Must roll back' }, headers[mode])).statusCode).toBe(500);
      expect(await get(date)).toEqual(original);
      expect(persistentFacts()).toEqual(before);
    } finally {
      database.sqlite.exec('DROP TRIGGER fail_note_update');
    }
  });
});

it('rejects missing/invalid authentication without creating a log', async () => {
  for (const authorization of [undefined, 'Bearer invalid', 'AgentToken invalid']) {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/nutrition/${date}`,
      headers: authorization ? { authorization } : {},
      payload: { notes: 'Unauthorized' },
    });
    expect(response.statusCode).toBe(401);
  }
  expect(await get(date)).toBeNull();
});

it('publishes unified generated OpenAPI schemas and an explicit nullable daily response', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/docs/json' });
  expect(response.statusCode).toBe(200);
  const operation = response.json().paths['/api/v1/nutrition/{date}'].patch;
  expect(operation.security).toEqual([{ bearerAuth: [] }, { agentToken: [] }]);
  const body = operation.requestBody.content['application/json'].schema;
  expect(body.properties.notes).toMatchObject({
    type: 'string',
    nullable: true,
    minLength: 1,
    maxLength: 2000,
  });
  expect(body.required ?? []).not.toContain('notes');
  expect(body.additionalProperties).toBe(false);
  expect(operation.responses['200']).toBeDefined();
});

describe.each(['Bearer', 'AgentToken'] as const)('%s note-only preservation boundary', (mode) => {
  it('keeps an absent historical day out of energy, quality, analytics, and adaptive evidence after add and clear', async () => {
    const store = makeProgram();
    const baseline = store.getState(owner).pendingCheckIn;
    if (!baseline) throw new Error('Expected fixture baseline');
    store.declineCheckIn(owner, baseline.id);
    const preview = store.previewCheckIn(owner, { kind: 'weekly', includeToday: false });
    const state = store.getState(owner);
    const analyticsStore = createAdaptiveAnalyticsStore({
      db: database.db,
      now: () => new Date(now),
    });
    const qualityStore = createDataQualityCalendarStore({ ...database, now: () => new Date(now) });
    const analytics = analyticsStore.getAnalytics(owner, { range: 'all', aggregation: 'auto' });
    const quality = qualityStore.getCalendar(owner, { start: date, end: date });
    const energy = await get(`${date}/energy-adherence`);
    const summary = await get(`${date}/summary`);
    const beforeFacts = persistentFacts();
    for (const notes of ['Context without nutrition evidence', null]) {
      const response = await patch({ notes }, headers[mode]);
      expect(response.statusCode).toBe(200);
      expect(response.json().data.log.notes).toBe(notes);
      expect.soft(await get(`${date}/energy-adherence`)).toEqual(energy);
      expect.soft({ ...(await get(`${date}/summary`)), notes: summary.notes }).toEqual(summary);
      expect.soft(store.getState(owner)).toEqual(state);
      expect.soft(qualityStore.getCalendar(owner, { start: date, end: date })).toEqual(quality);
      expect
        .soft(analyticsStore.getAnalytics(owner, { range: 'all', aggregation: 'auto' }))
        .toEqual(analytics);
      expect.soft(persistentFacts()).toEqual(beforeFacts);
    }
    const afterPreview = store.previewCheckIn(owner, { kind: 'weekly', includeToday: false });
    expect
      .soft(afterPreview.inputSnapshot.nutritionDays)
      .toEqual(preview.inputSnapshot.nutritionDays);
    expect(preview.dataFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect.soft(afterPreview.dataFingerprint).toEqual(preview.dataFingerprint);
    expect.soft(afterPreview.calculationSnapshot).toEqual(preview.calculationSnapshot);
    expect.soft(afterPreview.id).toBe(preview.id);
  });
});

describe.each(['Bearer', 'AgentToken'] as const)('%s nutrition evidence selection', (mode) => {
  it.each([
    { status: 'unknown' as const, statusUpdatedAt: null, withMeal: false, expected: 'missing' },
    { status: 'unknown' as const, statusUpdatedAt: 1, withMeal: false, expected: 'unknown' },
    { status: 'partial' as const, statusUpdatedAt: null, withMeal: false, expected: 'partial' },
    { status: 'complete' as const, statusUpdatedAt: 1, withMeal: false, expected: 'unavailable' },
    { status: 'unknown' as const, statusUpdatedAt: null, withMeal: true, expected: 'unknown' },
  ])(
    'preserves existing $status empty-day meaning (explicit=$statusUpdatedAt, meal=$withMeal)',
    async ({ status, statusUpdatedAt, withMeal, expected }) => {
      const logId = `preexisting-${owner}`;
      database.db
        .insert(nutritionLogs)
        .values({
          id: logId,
          userId: owner,
          date,
          status,
          statusUpdatedAt,
          createdAt: 1,
          updatedAt: 1,
        })
        .run();
      if (withMeal)
        database.db
          .insert(meals)
          .values({
            id: `empty-meal-${owner}`,
            nutritionLogId: logId,
            name: 'Existing meal placeholder',
          })
          .run();
      const energy = await get(`${date}/energy-adherence`);
      expect(energy.dataState).toBe(expected);
      expect(energy.nutrition.logId).toBe(expected === 'missing' ? null : logId);
      expect(energy.nutrition.intakeKcal).toBe(expected === 'missing' ? null : 0);
      const facts = persistentFacts();
      const daily = await get(date);
      for (const notes of ['Context only', null]) {
        expect((await patch({ notes }, headers[mode])).statusCode).toBe(200);
        expect(await get(`${date}/energy-adherence`)).toEqual(energy);
        const after = await get(date);
        expect({ ...after, log: { ...after.log, notes: daily.log.notes } }).toEqual(daily);
        expect(persistentFacts()).toEqual(facts);
      }
    },
  );

  it('uses the same log when meals are added after a note and keeps meal notes distinct', async () => {
    const note = (await patch({ notes: 'Day context' }, headers[mode])).json().data;
    const foodId = `before-meal-food-${owner}`;
    database.db
      .insert(foods)
      .values({
        id: foodId,
        userId: owner,
        name: 'Fictional oats',
        calories: 300,
        protein: 15,
        carbs: 40,
        fat: 10,
      })
      .run();
    await createMealForDate(owner, date, {
      name: 'Fictional breakfast',
      notes: 'Meal context',
      items: [
        {
          foodId,
          name: 'Fictional oats',
          amount: 1,
          unit: 'bowl',
          calories: 300,
          protein: 15,
          carbs: 40,
          fat: 10,
        },
      ],
    });
    const populated = await get(date);
    expect(populated.log.id).toBe(note.log.id);
    expect(populated.log.notes).toBe('Day context');
    expect(populated.meals).toHaveLength(1);
    expect(populated.meals[0].meal.notes).toBe('Meal context');
    const food = database.sqlite
      .prepare('SELECT usage_count, last_used_at FROM foods WHERE id = ?')
      .get(foodId);
    expect(food).toMatchObject({ usage_count: 1, last_used_at: expect.any(Number) });
    const energy = await get(`${date}/energy-adherence`);
    expect(energy.nutrition).toMatchObject({
      logId: note.log.id,
      mealCount: 1,
      itemCount: 1,
      intakeKcal: 300,
    });
    await patch({ notes: null }, headers[mode]);
    expect((await get(date)).meals).toEqual(populated.meals);
    expect(await get(`${date}/energy-adherence`)).toEqual(energy);
    expect(
      database.sqlite
        .prepare('SELECT usage_count, last_used_at FROM foods WHERE id = ?')
        .get(foodId),
    ).toEqual(food);
  });
});
