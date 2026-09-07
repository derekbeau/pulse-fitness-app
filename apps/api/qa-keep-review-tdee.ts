// Disposable issue 137 launcher. No .env loading or canonical database access.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { hash } from 'bcryptjs';
import * as schema from './src/db/schema/index.js';
import { createAdaptiveNutritionStore } from './src/routes/adaptive-nutrition/store.js';
import { createAdaptiveWeeklyReviewStore } from './src/routes/adaptive-nutrition/review-store.js';

const directory = mkdtempSync(join(tmpdir(), 'pulse-137-launch-'));
process.env.DATABASE_URL = join(directory, 'fictional.db');
process.env.PULSE_TEST_NOW = '2026-08-19T16:00:00.000Z';
process.env.NODE_ENV = 'test';
const sqlite = new Database(process.env.DATABASE_URL);
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: fileURLToPath(new URL('./drizzle', import.meta.url)) });
let nowMs = Date.parse('2026-07-20T16:00:00.000Z');
const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
const reviews = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
for (const [kind, calories] of [
  ['keep', 2560],
  ['adjust', 2800],
  ['hold', null],
  ['defer', 2560],
] as const) {
  const userId = `fictional-${kind}`;
  nowMs = Date.parse('2026-07-20T16:00:00.000Z');
  db.insert(schema.users)
    .values({
      id: userId,
      username: userId,
      passwordHash: await hash('fictional-qa-only', 10),
      weightUnit: 'kg',
      timeZone: 'America/Detroit',
    })
    .run();
  lifecycle.upsertProgram(userId, {
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
    currentWeight: { weight: 80, unit: 'kg' },
    rebaseline: false,
    supersedePending: false,
  });
  const baseline = lifecycle.getState(userId).pendingCheckIn;
  if (!baseline) throw new Error('Fictional baseline missing');
  lifecycle.acceptCheckIn(userId, baseline.id, {
    replaceSameDateTarget: false,
  });
  nowMs = Date.parse('2026-08-19T16:00:00.000Z');
  if (calories !== null) {
    for (let offset = 0; offset < 21; offset++) {
      const date = new Date(Date.parse('2026-07-29T12:00:00Z') + offset * 86400000)
        .toISOString()
        .slice(0, 10);
      const logId = `${userId}-${date}`;
      db.insert(schema.nutritionLogs)
        .values({
          id: logId,
          userId,
          date,
          status: 'complete',
          statusUpdatedAt: nowMs,
          updatedAt: nowMs,
        })
        .run();
      db.insert(schema.meals)
        .values({ id: logId, nutritionLogId: logId, name: 'Fictional daily intake' })
        .run();
      db.insert(schema.mealItems)
        .values({
          id: logId,
          mealId: logId,
          name: 'Fictional food',
          amount: 1,
          unit: 'day',
          calories,
          protein: 180,
          carbs: 250,
          fat: 75,
        })
        .run();
    }
    for (const date of ['2026-07-29', '2026-08-05', '2026-08-12', '2026-08-18']) {
      db.insert(schema.bodyWeight)
        .values({
          id: `${userId}-${date}`,
          userId,
          date,
          weight: 80 / 0.45359237,
          weightKg: 80,
          unitAtEntry: 'kg',
          updatedAt: nowMs,
        })
        .run();
    }
  }
  const review = reviews.preview(userId, { kind: 'weekly' });
  console.log(
    JSON.stringify({
      fixture: kind,
      reviewId: review.id,
      checkInId: review.checkInId,
      outcome: review.snapshot.modules.at(-1),
    }),
  );
}
sqlite.close();
const { buildServer } = await import('./src/index.js');
const app = buildServer();
await app.listen({ port: 3117, host: '127.0.0.1' });
console.log('Fictional issue137 API ready at http://127.0.0.1:3117');
