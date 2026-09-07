// Disposable localhost acceptance fixture. Run only after an uncached build.
// Never reads environment files or the default database; refuses an existing DB.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'qa-reports/daily-nutrition-notes');
const databasePath = resolve(root, 'data/daily-notes-acceptance/fictional.db');
assert(!existsSync(databasePath), 'Refusing to overwrite an existing acceptance DB');
process.env.DATABASE_URL = databasePath;
process.env.JWT_SECRET = 'fictional-local-notes-acceptance-only';
process.env.PULSE_TEST_NOW = '2026-09-07T16:00:00.000Z';
process.env.NODE_ENV = 'test'; // Suppress the application auto-start only.
const requireApi = createRequire(resolve(root, 'apps/api/package.json'));
const bcrypt = requireApi('bcryptjs');
const { db, sqlite } = await import('../../apps/api/dist/db/index.js');
const { migratePulseDatabase } = await import('../../apps/api/dist/db/migrate.js');
const { users, foods, agentTokens } = await import('../../apps/api/dist/db/schema/index.js');
const { createMealForDate, patchNutritionLogForDate } =
  await import('../../apps/api/dist/routes/nutrition/store.js');
const { createAdaptiveNutritionStore } =
  await import('../../apps/api/dist/routes/adaptive-nutrition/store.js');
const { createAdaptiveAnalyticsStore } =
  await import('../../apps/api/dist/routes/adaptive-nutrition/analytics-store.js');
const { createDataQualityCalendarStore } =
  await import('../../apps/api/dist/routes/data-quality/store.js');
const { buildServer } = await import('../../apps/api/dist/index.js');
process.env.NODE_ENV = 'development'; // Exercise real persisted-user auth checks.
migratePulseDatabase(sqlite, { migrationsFolder: resolve(root, 'apps/api/drizzle') });
const owner = 'fictional-notes-owner';
const stranger = 'fictional-notes-stranger';
const passwordHash = await bcrypt.hash('FictionalNotes133!', 10);
db.insert(users)
  .values(
    [owner, stranger].map((id) => ({
      id,
      username: id,
      name: id === owner ? 'Alex Example' : 'Sam Example',
      passwordHash,
      preferences: { timeZone: 'America/Detroit' },
    })),
  )
  .run();
db.insert(agentTokens)
  .values({
    id: 'fictional-notes-agent',
    userId: owner,
    name: 'Fictional acceptance agent',
    tokenHash: createHash('sha256').update('fictional-notes-agent-token').digest('hex'),
  })
  .run();
let now = new Date('2026-09-01T16:00:00.000Z');
const adaptive = createAdaptiveNutritionStore({ db, sqlite, now: () => now });
adaptive.upsertProgram(owner, {
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
const baseline = adaptive.getState(owner).pendingCheckIn;
assert(baseline);
adaptive.acceptCheckIn(owner, baseline.id, {});
now = new Date(process.env.PULSE_TEST_NOW);
for (const [name, calories, protein, carbs, fat, time] of [
  ['Breakfast oats', 550, 35, 70, 15, '08:00'],
  ['Lunch grain bowl', 800, 60, 95, 20, '12:30'],
  ['Dinner salmon', 1050, 85, 90, 40, '18:30'],
]) {
  const id = 'fictional-' + time;
  db.insert(foods).values({ id, userId: owner, name, calories, protein, carbs, fat }).run();
  await createMealForDate(owner, '2026-09-03', {
    name,
    time,
    notes: 'Meal context remains separate.',
    items: [{ foodId: id, name, amount: 1, unit: 'serving', calories, protein, carbs, fat }],
  });
}
sqlite
  .prepare(
    "UPDATE nutrition_logs SET status = 'complete', status_updated_at = ? WHERE user_id = ? AND date = ?",
  )
  .run(now.getTime(), owner, '2026-09-03');
await patchNutritionLogForDate(stranger, '2026-09-03', {
  notes: 'Private fictional stranger note',
});
await patchNutritionLogForDate(stranger, '2026-09-04', {
  notes: 'Private fictional stranger empty-day note',
});
const app = buildServer();
await app.ready();
const auth = {
  authorization: `Bearer ${app.jwt.sign({ sub: owner, type: 'session', iss: 'pulse-api' }, { expiresIn: '8h' })}`,
};
// Deliberately fail a known fixture input. The real transaction/error path runs.
sqlite.exec(
  "CREATE TEMP TRIGGER fail_fixture_note BEFORE UPDATE OF notes ON nutrition_logs WHEN NEW.notes = 'Simulated save failure' BEGIN SELECT RAISE(ABORT, 'Fictional acceptance persistence failure'); END",
);
const analytics = createAdaptiveAnalyticsStore({ db, now: () => now });
const quality = createDataQualityCalendarStore({ db, sqlite, now: () => now });
let sequence = 0;
async function snapshot() {
  const preview = adaptive.previewCheckIn(owner, { kind: 'weekly', includeToday: false });
  const facts = Object.fromEntries(
    [
      'nutrition_logs',
      'meals',
      'meal_items',
      'foods',
      'nutrition_targets',
      'nutrition_target_events',
      'body_weight',
      'adaptive_nutrition_programs',
      'adaptive_nutrition_checkins',
    ].map((table) => [table, sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]),
  );
  const api = {};
  for (const path of [
    '2026-09-03',
    '2026-09-04',
    '2026-09-03/summary',
    '2026-09-04/summary',
    '2026-09-03/energy-adherence',
    '2026-09-04/energy-adherence',
    'logging-context?date=2026-09-03',
    'logging-context?date=2026-09-04',
    'week-summary?date=2026-09-03T12:00:00.000Z',
  ]) {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/nutrition/${path}`,
      headers: auth,
    });
    assert.equal(res.statusCode, 200, path);
    api[path] = res.json().data;
  }
  const file = resolve(output, `browser-readback-${String(sequence++).padStart(2, '0')}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        facts,
        api,
        preview,
        state: adaptive.getState(owner),
        analytics: analytics.getAnalytics(owner, { range: 'all', aggregation: 'auto' }),
        quality: quality.getCalendar(owner, { start: '2026-09-01', end: '2026-09-07' }),
        integrity: {
          quickCheck: sqlite.pragma('quick_check'),
          foreignKeys: sqlite.pragma('foreign_key_check'),
        },
      },
      null,
      2,
    ) + '\n',
  );
  console.log('SNAPSHOT', file);
}
await snapshot();
await app.listen({ host: '127.0.0.1', port: 3133 });
mkdirSync(resolve(root, 'data/daily-notes-acceptance'), { recursive: true });
writeFileSync(resolve(root, 'data/daily-notes-acceptance/server.pid'), String(process.pid));
process.on(
  'SIGUSR2',
  () =>
    void snapshot().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    }),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(
    signal,
    () =>
      void app.close().then(() => {
        sqlite.close();
        process.exit(0);
      }),
  );
console.log('FICTIONAL FIXTURE READY http://127.0.0.1:3133');
