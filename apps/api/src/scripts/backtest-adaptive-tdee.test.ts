import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  formatAdaptiveBacktestCsv,
  loadAdaptiveBacktestDatabase,
  parseAdaptiveBacktestJson,
  runAdaptiveTdeeBacktest,
} from './backtest-adaptive-tdee.js';

const fixturePath = fileURLToPath(
  new URL('../../../../scripts/fixtures/adaptive-tdee-backtest.json', import.meta.url),
);
const fixture = () => parseAdaptiveBacktestJson(JSON.parse(readFileSync(fixturePath, 'utf8')));
const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

const hashFile = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('Adaptive TDEE read-only backtest', () => {
  it('produces a historical estimate but refuses to extrapolate April data into August', () => {
    const rows = runAdaptiveTdeeBacktest(fixture());

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      checkInDate: '2026-04-02',
      state: 'updating',
      completeNutritionDays: 20,
      averageDailyIntakeKcal: 2400,
      actualWeightCount: 8,
    });
    expect(rows[0].excludedNutritionDates).toContain('2026-03-13');
    expect(rows[0].proposedTdeeKcal).not.toBeNull();
    expect(rows[1]).toMatchObject({
      checkInDate: '2026-08-13',
      state: 'holding',
      completeNutritionDays: 0,
      actualWeightCount: 0,
      observedTdeeKcal: null,
      proposedTdeeKcal: null,
    });
    expect(rows[1].reasonCodes).toEqual(
      expect.arrayContaining([
        'INSUFFICIENT_NUTRITION',
        'INSUFFICIENT_WEIGHT',
        'NO_CURRENT_WEIGHT',
      ]),
    );
    expect(rows[1].weightInputDates).toEqual([]);
  });

  it('serializes the required data as CSV', () => {
    const csv = formatAdaptiveBacktestCsv(runAdaptiveTdeeBacktest(fixture()));

    expect(csv).toContain('checkInDate,kind,state,analysisStart,analysisEnd');
    expect(csv).toContain('2026-04-02,manual,updating');
    expect(csv).toContain('2026-08-13,manual,holding');
    expect(csv).toContain('INSUFFICIENT_NUTRITION');
  });

  it('opens SQLite in query-only mode, applies completion labels in memory, and preserves bytes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-backtest-readonly-'));
    tempDirectories.push(directory);
    const databasePath = join(directory, 'history.db');
    const sqlite = new Database(databasePath);
    sqlite.exec(`
      create table users (id text primary key);
      create table nutrition_logs (
        id text primary key, user_id text not null, date text not null, status text not null,
        updated_at integer not null
      );
      create table meals (id text primary key, nutrition_log_id text not null);
      create table meal_items (id text primary key, meal_id text not null, calories real not null);
      create table body_weight (
        id text primary key, user_id text not null, date text not null, weight_kg real not null,
        updated_at integer not null
      );
      insert into users (id) values ('user-1');
    `);
    const source = fixture();
    const insertLog = sqlite.prepare(
      'insert into nutrition_logs (id, user_id, date, status, updated_at) values (?, ?, ?, ?, ?)',
    );
    const insertMeal = sqlite.prepare('insert into meals (id, nutrition_log_id) values (?, ?)');
    const insertItem = sqlite.prepare(
      'insert into meal_items (id, meal_id, calories) values (?, ?, ?)',
    );
    for (const day of source.nutritionDays) {
      insertLog.run(day.id, 'user-1', day.date, 'unknown', day.updatedAt);
      insertMeal.run(`meal-${day.id}`, day.id);
      insertItem.run(`item-${day.id}`, `meal-${day.id}`, day.calories);
    }
    const insertWeight = sqlite.prepare(
      'insert into body_weight (id, user_id, date, weight_kg, updated_at) values (?, ?, ?, ?, ?)',
    );
    for (const weight of source.weightEntries) {
      insertWeight.run(weight.id, 'user-1', weight.date, weight.weightKg, weight.updatedAt);
    }
    sqlite.close();
    const beforeHash = hashFile(databasePath);

    const withoutLabels = loadAdaptiveBacktestDatabase({
      checkIns: [source.checkIns[0]],
      databasePath,
      program: source.program,
      userId: 'user-1',
    });
    expect(runAdaptiveTdeeBacktest(withoutLabels)[0]).toMatchObject({
      state: 'learning',
      completeNutritionDays: 0,
    });

    const withLabels = loadAdaptiveBacktestDatabase({
      checkIns: [source.checkIns[0]],
      completeDates: source.nutritionDays
        .filter((day) => day.status === 'complete')
        .map((day) => day.date),
      databasePath,
      program: source.program,
      userId: 'user-1',
    });
    expect(runAdaptiveTdeeBacktest(withLabels)[0]).toMatchObject({
      state: 'updating',
      completeNutritionDays: 20,
    });
    expect(hashFile(databasePath)).toBe(beforeHash);

    const verification = new Database(databasePath, { readonly: true });
    expect(
      verification
        .prepare("select count(*) as count from nutrition_logs where status = 'unknown'")
        .get(),
    ).toEqual({ count: source.nutritionDays.length });
    verification.close();
  });
});
