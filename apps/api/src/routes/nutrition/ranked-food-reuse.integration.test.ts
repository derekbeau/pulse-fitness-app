import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { nutritionLoggingContextSchema, type NutritionLoggingContext } from '@pulse/shared';
import {
  agentTokens,
  foods,
  mealItems,
  meals,
  nutritionLogs,
  users,
} from '../../db/schema/index.js';

type DatabaseModule = typeof import('../../db/index.js');
let app: FastifyInstance;
let db: DatabaseModule['db'];
let sqlite: DatabaseModule['sqlite'];
let tempDir: string;
const macros = { calories: 100, protein: 5, carbs: 10, fat: 4 };
const auth = (user = 'owner', mode = 'agent') => ({
  authorization:
    mode === 'agent'
      ? `AgentToken fictional-${user}`
      : `Bearer ${app.jwt.sign({ sub: user, type: 'session', iss: 'pulse-api' }, { expiresIn: '7d' })}`,
});
const saved = (id = 'saved', userId = 'owner', name = 'Rao’s Marinara', overrides = {}) =>
  db
    .insert(foods)
    .values({
      id,
      userId,
      name,
      ...macros,
      fiber: 2,
      sugar: 3,
      brand: 'Jar Co',
      servingSize: 'cup',
      ...overrides,
    })
    .run();
const history = (
  id: string,
  date: string,
  name = 'Travel bowl',
  userId = 'owner',
  overrides = {},
) => {
  db.insert(nutritionLogs)
    .values({ id: `log-${id}`, userId, date })
    .onConflictDoNothing()
    .run();
  const log = db
    .select()
    .from(nutritionLogs)
    .all()
    .find((row) => row.userId === userId && row.date === date);
  if (!log) throw new Error('Fixture log not found');
  db.insert(meals)
    .values({ id: `meal-${id}`, nutritionLogId: log.id, name: 'Dinner' })
    .run();
  db.insert(mealItems)
    .values({
      id,
      mealId: `meal-${id}`,
      foodId: null,
      name,
      amount: 1,
      unit: 'plate',
      ...macros,
      createdAt: 1,
      ...overrides,
    })
    .run();
};
const readContext = async (q = '', mode = 'agent'): Promise<NutritionLoggingContext> => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/nutrition/logging-context?date=2026-09-07&q=${encodeURIComponent(q)}&limitFoods=1&limitRecentItems=1`,
    headers: auth('owner', mode),
  });
  expect(response.statusCode).toBe(200);
  return nutritionLoggingContextSchema.parse(response.json().data);
};
const snapshot = () => ({
  foods: db.select().from(foods).all(),
  items: db.select().from(mealItems).all(),
  meals: db.select().from(meals).all(),
});
const checkUsage = () => {
  const mismatches = sqlite
    .prepare(
      `SELECT f.id FROM foods f WHERE f.usage_count != (SELECT COUNT(*) FROM meal_items i JOIN meals m ON m.id=i.meal_id JOIN nutrition_logs n ON n.id=m.nutrition_log_id WHERE i.food_id=f.id AND n.user_id=f.user_id) OR f.last_used_at IS NOT (SELECT MAX(i.created_at) FROM meal_items i JOIN meals m ON m.id=i.meal_id JOIN nutrition_logs n ON n.id=m.nutrition_log_id WHERE i.food_id=f.id AND n.user_id=f.user_id)`,
    )
    .all();
  expect(mismatches).toEqual([]);
};

describe('ranked food reuse frozen contract / isolated SQLite', () => {
  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-138-'));
    vi.stubEnv('DATABASE_URL', join(tempDir, 'fictional.db'));
    vi.stubEnv('JWT_SECRET', 'fictional-138-test-secret');
    vi.resetModules();
    const module = await import('../../db/index.js');
    db = module.db;
    sqlite = module.sqlite;
    migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)) });
    app = (await import('../../index.js')).buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    sqlite?.close();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  beforeEach(() => {
    db.delete(mealItems).run();
    db.delete(meals).run();
    db.delete(nutritionLogs).run();
    db.delete(agentTokens).run();
    db.delete(foods).run();
    db.delete(users).run();
    for (const id of ['owner', 'foreign']) {
      db.insert(users)
        .values({
          id,
          username: id,
          passwordHash: 'fictional-only',
          preferences: { timeZone: 'America/Detroit' },
        })
        .run();
      db.insert(agentTokens)
        .values({
          id: `token-${id}`,
          userId: id,
          name: 'fixture',
          tokenHash: createHash('sha256').update(`fictional-${id}`).digest('hex'),
        })
        .run();
    }
  });
  it('proves context auth parity, all window boundaries, recurrence floor and read-only owner isolation', async () => {
    history('start', '2026-08-08');
    history('last', '2026-09-06');
    history('outside', '2026-08-07');
    history('selected', '2026-09-07');
    history('one', '2026-09-01', 'One day');
    history('two', '2026-09-01', 'One day');
    history('f1', '2026-08-10', 'Travel bowl', 'foreign', { calories: 999 });
    history('f2', '2026-08-11', 'Foreign secret', 'foreign');
    saved('foreign-food', 'foreign', 'Travel bowl');
    const before = snapshot();
    const result = await readContext('Travel bowl');
    expect(result).toEqual(await readContext('Travel bowl', 'jwt'));
    expect(result.promotionCandidates).toHaveLength(1);
    expect(result.promotionCandidates[0]).toMatchObject({
      occurrenceCount: 2,
      distinctDayCount: 2,
      mostRecentDate: '2026-09-06',
      stability: 'stable_exact',
      reason: 'REPEATED_ADHOC',
    });
    expect(result.promotionCandidates[0]?.snapshots.map((entry) => entry.item.id)).toEqual([
      'last',
      'start',
    ]);
    expect(result.savedFoodMatches).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('Foreign secret');
    expect(JSON.stringify(result)).not.toContain('foreign-food');
    expect(snapshot()).toEqual(before);
  });
  it('marks materially ambiguous matches even when response limit is one; foreign high usage cannot change the rank', async () => {
    saved('a');
    saved('b', 'owner', "RAO'S—MARINARA");
    saved('foreign', 'foreign', 'Rao’s Marinara', { usageCount: 999 });
    const result = await readContext('raos marinara');
    expect(result.savedFoodMatches).toHaveLength(1);
    expect(result.savedFoodMatches[0]).toMatchObject({
      food: { id: 'a' },
      reason: 'exact_normalized',
      ambiguity: 'multiple_candidates',
    });
  });
  it('uses owned recent linked names as evidence without truncating by the presentation limit', async () => {
    saved();
    history('alias', '2026-09-01', 'Old sauce name', 'owner', { foodId: 'saved' });
    history('recent', '2026-09-06', 'Other meal');
    const result = await readContext('Old sauce name');
    expect(result.recentMealItems[0]?.item.id).toBe('recent');
    expect(result.savedFoodMatches[0]).toMatchObject({
      food: { id: 'saved' },
      reason: 'recent_name',
    });
  });
  it.each(['preferred', 'date', 'append'])(
    'classifies reuse/create/adhoc and preserves all provenance on %s',
    async (surface) => {
      saved();
      history('prior', '2026-09-05', 'New stable food');
      history('prior-2', '2026-09-04', 'New stable food');
      expect((await readContext('New stable food')).promotionCandidates[0]).toMatchObject({
        stability: 'stable_exact',
        occurrenceCount: 2,
        reason: 'REPEATED_ADHOC',
      });
      let url = surface === 'date' ? '/api/v1/nutrition/2026-09-07/meals' : '/api/v1/meals';
      if (surface === 'append') url = '/api/v1/meals/meal-prior/items';
      const beforeHistory = db.select().from(mealItems).all();
      const response = await app.inject({
        method: 'POST',
        url,
        headers: auth(),
        payload: {
          date: '2026-09-07',
          name: 'Lunch',
          returnSummary: true,
          items: [
            {
              foodName: "RAO'S—MARINARA",
              brand: 'jar co',
              quantity: 2,
              ...macros,
              calories: 999,
              fiber: 999,
              sugar: 999,
            },
            {
              foodName: 'New stable food',
              quantity: 2,
              unit: 'cup',
              servingSize: 'one cup',
              displayQuantity: 1,
              displayUnit: 'bowl',
              servingGrams: 150,
              ...macros,
              fiber: 2,
              sugar: 3,
              brand: 'Box Co',
              source: 'Label',
              notes: 'Fictional verified label',
              verified: true,
              tags: ['STAPLE'],
              saveToFoods: true,
            },
            { foodName: 'Restaurant mixed bowl', quantity: 1, adhoc: true, ...macros },
          ],
        },
      });
      expect(response.statusCode, response.body).toBe(surface === 'append' ? 200 : 201);
      const body = response.json();
      expect(body.agent.itemOutcomes.slice(-3).map((x: { outcome: string }) => x.outcome)).toEqual([
        'reused',
        'created',
        'adhoc',
      ]);
      const submitted = body.data.items.slice(-3);
      expect(submitted[0]).toMatchObject({
        foodId: 'saved',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 8,
        fiber: 4,
        sugar: 6,
      });
      expect(submitted[2].foodId).toBeNull();
      const created = db
        .select()
        .from(foods)
        .all()
        .find((row) => row.name === 'New stable food');
      if (!created) throw new Error('Expected a newly created food');
      expect(created).toMatchObject({
        brand: 'Box Co',
        source: 'Label',
        notes: 'Fictional verified label',
        servingSize: 'one cup',
        servingGrams: 150,
        fiber: 2,
        sugar: 3,
        verified: true,
        tags: ['staple'],
        ...macros,
      });
      for (const oldItem of beforeHistory)
        expect(db.select().from(mealItems).where(eq(mealItems.id, oldItem.id)).get()).toEqual(
          oldItem,
        );
      expect((await readContext('New stable food')).promotionCandidates[0]).toMatchObject({
        occurrenceCount: 2,
        reason: 'EXACT_SAVED_MATCH',
      });
      if (surface !== 'append') {
        expect(body.data.summary.actual.calories).toBe(500);
        expect([...body.agent.hints, ...body.agent.suggestedActions].join(' ')).not.toMatch(
          /summary/i,
        );
      }
      checkUsage();
      const immutable = db.select().from(mealItems).all();
      const update = await app.inject({
        method: 'PUT',
        url: `/api/v1/foods/${created.id}`,
        headers: auth(),
        payload: {
          name: 'Changed',
          calories: 999,
          protein: 99,
          carbs: 99,
          fat: 99,
          fiber: 99,
          sugar: 99,
          servingSize: 'different',
        },
      });
      expect(update.statusCode, update.body).toBe(200);
      expect(db.select().from(mealItems).all()).toEqual(immutable);
      checkUsage();
    },
  );
  it.each(['preferred', 'date', 'append'])(
    'rejects contradictions before writes on %s with either auth mode',
    async (surface) => {
      saved();
      history('target', '2026-09-05');
      const url =
        surface === 'date'
          ? '/api/v1/nutrition/2026-09-07/meals'
          : surface === 'append'
            ? '/api/v1/meals/meal-target/items'
            : '/api/v1/meals';
      const before = snapshot();
      for (const mode of ['agent', 'jwt'])
        for (const contradiction of [
          { adhoc: true, foodId: 'saved' },
          { adhoc: true, saveToFoods: true },
          { saveToFoods: false, foodId: 'saved' },
        ]) {
          const response = await app.inject({
            method: 'POST',
            url,
            headers: auth('owner', mode),
            payload: {
              date: '2026-09-07',
              name: 'Lunch',
              items: [{ foodName: 'New', quantity: 1, ...macros, ...contradiction }],
            },
          });
          expect(response.statusCode, response.body).toBe(400);
          if ('foodId' in contradiction) expect(response.body).toContain('ADHOC_FOOD_ID_CONFLICT');
        }
      expect(snapshot()).toEqual(before);
    },
  );
  it('never automatically binds fuzzy, alias, token-order, recent, ambiguous or brand-mismatched candidates', async () => {
    saved();
    saved('jam', 'owner', 'Preserves');
    history('old', '2026-09-01', 'Old sauce', 'owner', { foodId: 'saved' });
    for (const item of [
      { foodName: 'Marinara' },
      { foodName: 'jam' },
      { foodName: 'Marinara Raos' },
      { foodName: 'Old sauce' },
      { foodName: 'Rao’s Marinara', brand: 'Wrong', ...macros },
    ]) {
      const before = snapshot();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals',
        headers: auth(),
        payload: { date: '2026-09-07', name: 'Lunch', items: [{ quantity: 1, ...item }] },
      });
      expect(response.statusCode, response.body).toBe(422);
      expect(snapshot()).toEqual(before);
    }
    saved('duplicate');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/meals',
      headers: auth(),
      payload: {
        date: '2026-09-07',
        name: 'Lunch',
        items: [{ foodName: 'Rao’s Marinara', quantity: 1, ...macros }],
      },
    });
    expect(response.statusCode, response.body).toBe(422);
    const explicit = await app.inject({
      method: 'POST',
      url: '/api/v1/meals',
      headers: auth(),
      payload: {
        date: '2026-09-07',
        name: 'Lunch',
        items: [{ foodId: 'saved', name: 'Intentional', amount: 2, ...macros }],
      },
    });
    expect(explicit.statusCode, explicit.body).toBe(201);
    expect(explicit.json().data.items[0].calories).toBe(200);
  });
  it('preserves explicit ad hoc and saveToFoods false even for an exact saved match', async () => {
    saved();
    for (const choice of [{ adhoc: true }, { saveToFoods: false }]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals',
        headers: auth(),
        payload: {
          date: '2026-09-07',
          name: 'Lunch',
          items: [{ foodName: 'Rao’s Marinara', quantity: 1, ...macros, ...choice }],
        },
      });
      expect(response.statusCode, response.body).toBe(201);
      expect(response.json().data.items[0].foodId).toBeNull();
      expect(response.json().agent.itemOutcomes[0].outcome).toBe('adhoc');
    }
    expect(db.select().from(foods).all()).toHaveLength(1);
    checkUsage();
  });
  it('fails closed on foreign ids and append targets without creating or changing any food', async () => {
    saved('f', 'foreign');
    history('f', '2026-09-01', 'Foreign meal', 'foreign');
    const before = snapshot();
    const foreignId = await app.inject({
      method: 'POST',
      url: '/api/v1/meals',
      headers: auth(),
      payload: {
        date: '2026-09-07',
        name: 'Lunch',
        items: [
          { foodName: 'Would create', quantity: 1, ...macros },
          { foodId: 'f', name: 'Foreign', amount: 1, ...macros },
        ],
      },
    });
    expect(foreignId.statusCode, foreignId.body).toBe(422);
    const append = await app.inject({
      method: 'POST',
      url: '/api/v1/meals/meal-f/items',
      headers: auth(),
      payload: { items: [{ foodName: 'Would create', quantity: 1, ...macros }] },
    });
    expect(append.statusCode, append.body).toBe(404);
    expect(snapshot()).toEqual(before);
  });
  it('keeps note-only writes equivalent for snapshots, usage, recurrence, summary totals and learning facts', async () => {
    history('a', '2026-09-01');
    history('b', '2026-09-02');
    saved();
    const before = snapshot();
    const contextBefore = await readContext();
    const learningBefore = sqlite.prepare('SELECT * FROM nutrition_logs ORDER BY id').all();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/nutrition/2026-09-02',
      headers: auth(),
      payload: { notes: 'Travel context only' },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(snapshot()).toEqual(before);
    expect((await readContext()).promotionCandidates).toEqual(contextBefore.promotionCandidates);
    const stripNotes = (rows: unknown[]) =>
      rows.map((row) => {
        return Object.fromEntries(
          Object.entries(row as Record<string, unknown>).filter(
            ([key]) => key !== 'notes' && key !== 'updated_at',
          ),
        );
      });
    expect(stripNotes(sqlite.prepare('SELECT * FROM nutrition_logs ORDER BY id').all())).toEqual(
      stripNotes(learningBefore),
    );
    checkUsage();
  });
  it('creates one definition for repeated current items and preserves exact per-row usage', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/meals',
      headers: auth(),
      payload: {
        date: '2026-09-07',
        name: 'Lunch',
        items: [
          { foodName: 'New staple', quantity: 1, ...macros },
          { foodName: 'New staple', quantity: 2, ...macros },
        ],
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    const library = db.select().from(foods).all();
    expect(library).toHaveLength(1);
    expect(library[0]?.usageCount).toBe(2);
    checkUsage();
    expect(response.json().agent.hints.join(' ')).toContain('day nutrition summary');
  });
  it.each(['preferred', 'date', 'append'])(
    'preserves JWT responses and owner validation for %s',
    async (surface) => {
      saved();
      saved('foreign-food', 'foreign');
      history('target', '2026-09-01');
      const url =
        surface === 'date'
          ? '/api/v1/nutrition/2026-09-07/meals'
          : surface === 'append'
            ? '/api/v1/meals/meal-target/items'
            : '/api/v1/meals';
      const before = snapshot();
      for (const mode of ['agent', 'jwt']) {
        const foreign = await app.inject({
          method: 'POST',
          url,
          headers: auth('owner', mode),
          payload: {
            date: '2026-09-07',
            name: 'Lunch',
            items: [{ foodId: 'foreign-food', name: 'Foreign', amount: 1, ...macros }],
          },
        });
        expect(foreign.statusCode, foreign.body).toBe(422);
        expect(snapshot()).toEqual(before);
      }
      const response = await app.inject({
        method: 'POST',
        url,
        headers: auth('owner', 'jwt'),
        payload: {
          date: '2026-09-07',
          name: 'Lunch',
          items: [{ foodId: 'saved', name: 'Custom display', amount: 2, ...macros, calories: 123 }],
        },
      });
      expect(response.statusCode, response.body).toBe(surface === 'append' ? 200 : 201);
      expect(response.json()).not.toHaveProperty('agent');
      expect(response.json().data.items.at(-1)).toMatchObject({
        name: 'Custom display',
        calories: 123,
      });
      checkUsage();
    },
  );
  it('rejects incomplete inline macros before creation and ignores deleted definitions for matching', async () => {
    saved('deleted', 'owner', 'Deleted food', { deletedAt: 1 });
    expect((await readContext('Deleted food')).savedFoodMatches).toEqual([]);
    const before = snapshot();
    for (const item of [
      { foodName: 'New', quantity: 1, calories: 100, saveToFoods: true },
      { foodName: 'New', quantity: 1, adhoc: true },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals',
        headers: auth(),
        payload: { date: '2026-09-07', name: 'Lunch', items: [item] },
      });
      expect(response.statusCode, response.body).toBe(400);
      expect(snapshot()).toEqual(before);
    }
  });
  it.each(['preferred', 'date', 'append'])(
    'rolls back new food definitions and usage with failed %s persistence',
    async (surface) => {
      history('target', '2026-09-01');
      const url =
        surface === 'date'
          ? '/api/v1/nutrition/2026-09-07/meals'
          : surface === 'append'
            ? '/api/v1/meals/meal-target/items'
            : '/api/v1/meals';
      const before = snapshot();
      sqlite.exec(
        "CREATE TRIGGER reject_138_item BEFORE INSERT ON meal_items BEGIN SELECT RAISE(ABORT, 'fictional failure'); END;",
      );
      try {
        const response = await app.inject({
          method: 'POST',
          url,
          headers: auth(),
          payload: {
            date: '2026-09-07',
            name: 'Lunch',
            items: [{ foodName: 'Must roll back', quantity: 1, ...macros }],
          },
        });
        expect(response.statusCode).toBe(500);
        expect(snapshot()).toEqual(before);
        checkUsage();
      } finally {
        sqlite.exec('DROP TRIGGER reject_138_item');
      }
    },
  );
  it('serializes only categorical ranked matches, including frequent and nested promotion matches', async () => {
    saved('ranked', 'owner', 'Travel bowl');
    history('a', '2026-09-01');
    history('b', '2026-09-02', 'Travel bowl', 'owner', { calories: 150 });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/nutrition/logging-context?date=2026-09-07&q=Travel%20bowl',
      headers: auth(),
    });
    expect(response.statusCode).toBe(200);
    // Inspect raw serialization; parsing through Zod would strip an accidental extra field.
    const context = response.json().data;
    const matches = [
      ...context.savedFoodMatches,
      ...context.frequentFoods,
      ...context.promotionCandidates.map(
        (candidate: { likelySavedFoodMatch: unknown }) => candidate.likelySavedFoodMatch,
      ),
    ];
    expect(matches).toHaveLength(3);
    for (const match of matches) {
      expect(Object.keys(match).sort()).toEqual([
        'aliasVersion',
        'ambiguity',
        'evidence',
        'food',
        'matchedVariant',
        'reason',
      ]);
      expect(match.evidence.length).toBeGreaterThan(0);
    }
    expect(context.promotionCandidates[0]).toMatchObject({
      stability: 'review_only',
      occurrenceCount: 2,
      distinctDayCount: 2,
    });
    const openapi = (await app.inject({ method: 'GET', url: '/api/docs/json' })).json();
    const properties =
      openapi.paths['/api/v1/nutrition/logging-context'].get.responses['200'].content[
        'application/json'
      ].schema.properties.data.properties;
    for (const match of [
      properties.savedFoodMatches.items,
      properties.frequentFoods.items,
      properties.promotionCandidates.items.properties.likelySavedFoodMatch,
    ]) {
      expect(Object.keys(match.properties).sort()).toEqual([
        'aliasVersion',
        'ambiguity',
        'evidence',
        'food',
        'matchedVariant',
        'reason',
      ]);
    }
    expect(properties.shorthandExpansions.items.properties).toHaveProperty('score');
  });
  it('documents generated shared OpenAPI contracts and retains strict authentication', async () => {
    const schema = await app.inject({ method: 'GET', url: '/api/docs/json' });
    expect(schema.statusCode).toBe(200);
    const paths = schema.json().paths;
    expect(JSON.stringify(paths['/api/v1/nutrition/logging-context'])).toContain(
      'promotionCandidates',
    );
    for (const route of [
      '/api/v1/meals',
      '/api/v1/nutrition/{date}/meals',
      '/api/v1/meals/{id}/items',
    ]) {
      const contract = JSON.stringify(paths[route] ?? paths[`${route}/`]);
      expect(contract).toContain('itemOutcomes');
      expect(contract).toContain('servingGrams');
      expect(contract).toContain('agentToken');
    }
    for (const headers of [
      {},
      { authorization: 'fictional-owner' },
      { authorization: `Bearer ${app.jwt.sign({ sub: 'owner' })}` },
    ]) {
      expect(
        (await app.inject({ method: 'GET', url: '/api/v1/nutrition/logging-context', headers }))
          .statusCode,
      ).toBe(401);
    }
  });
});
