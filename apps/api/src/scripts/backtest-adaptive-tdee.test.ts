import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  formatAdaptiveBacktestCsv,
  loadAdaptiveBacktestDatabase,
  parseAdaptiveBacktestJson,
  parseCli,
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
const snapshotFiles = (paths: string[]) =>
  paths.map((path) => ({ path, bytes: existsSync(path) ? readFileSync(path) : null }));

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

  it('is independent of source-array ordering, including emitted input dates', () => {
    const source = fixture();
    const reversed = {
      ...source,
      checkIns: [...source.checkIns].reverse(),
      nutritionDays: [...source.nutritionDays].reverse(),
      weightEntries: [...source.weightEntries].reverse(),
    };

    expect(runAdaptiveTdeeBacktest(reversed)).toEqual(runAdaptiveTdeeBacktest(source));
  });

  it('lets a later persisted manual target supersede an earlier simulated adaptive target', () => {
    const source = fixture();
    source.currentTargets = [
      {
        id: 'later-manual-target',
        calories: 3100,
        protein: 160,
        carbs: 395,
        fat: 98,
        source: 'manual',
        adaptiveCheckInId: null,
        macroCalories: 3102,
        effectiveDate: '2026-06-01',
        updatedAt: Date.parse('2026-06-01T12:00:00.000Z'),
      },
    ];

    const rows = runAdaptiveTdeeBacktest(source);

    expect(rows[0].priorTdeeKcal).toBe(2500);
    expect(rows[1]).toMatchObject({
      priorTdeeKcal: rows[0].proposedTdeeKcal,
      currentTargetCalories: 3100,
      currentTargetSource: 'manual',
      currentTargetEffectiveDate: '2026-06-01',
    });
  });

  it('uses deterministic target tie-breaking without treating a manual target as an Adaptive TDEE prior', () => {
    const source = fixture();
    source.currentTargets = [
      {
        id: 'target-a',
        calories: 2800,
        protein: 160,
        carbs: 320,
        fat: 98,
        source: 'manual',
        adaptiveCheckInId: null,
        macroCalories: 2802,
        effectiveDate: '2026-06-01',
        updatedAt: 100,
      },
      {
        id: 'target-b',
        calories: 3000,
        protein: 160,
        carbs: 370,
        fat: 98,
        source: 'manual',
        adaptiveCheckInId: null,
        macroCalories: 3002,
        effectiveDate: '2026-06-01',
        updatedAt: 200,
      },
    ];

    const forward = runAdaptiveTdeeBacktest(source);
    const reversed = runAdaptiveTdeeBacktest({
      ...source,
      currentTargets: [...source.currentTargets].reverse(),
    });

    expect(reversed).toEqual(forward);
    expect(forward[1]).toMatchObject({
      priorTdeeKcal: forward[0].proposedTdeeKcal,
      currentTargetCalories: 3000,
      currentTargetSource: 'manual',
    });
  });

  it('rejects duplicate replay check-ins from parsed and directly constructed sources', () => {
    const source = fixture();
    const duplicate = { ...source.checkIns[0] };

    expect(() =>
      runAdaptiveTdeeBacktest({ ...source, checkIns: [...source.checkIns, duplicate] }),
    ).toThrow('Duplicate manual check-in for 2026-04-02');
    expect(() =>
      parseAdaptiveBacktestJson({
        version: 1,
        ...source,
        checkIns: [...source.checkIns, duplicate],
      }),
    ).toThrow('Duplicate manual check-in for 2026-04-02');
  });

  it('rejects unknown and duplicate CLI flags', () => {
    expect(() => parseCli(['--input', fixturePath, '--unknown', 'value'])).toThrow(
      'Unknown option: --unknown',
    );
    expect(() => parseCli(['--input', fixturePath, '--input', fixturePath])).toThrow(
      'Duplicate option: --input',
    );
    expect(() => parseCli([`--input=${fixturePath}`, `--format=json`, '--format=csv'])).toThrow(
      'Duplicate option: --format',
    );
  });

  it('serializes the required data as CSV', () => {
    const rows = runAdaptiveTdeeBacktest(fixture());
    const csv = formatAdaptiveBacktestCsv(rows);

    expect(csv).toContain('checkInDate,kind,state,analysisStart,analysisEnd');
    expect(csv).toContain('2026-04-02,manual,updating');
    expect(csv).toContain('2026-08-13,manual,holding');
    expect(csv).toContain('INSUFFICIENT_NUTRITION');
    expect(JSON.parse(JSON.stringify(rows))).toEqual(rows);
    expect(Object.keys(rows[0])).toEqual(csv.split('\n')[0].split(','));
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

  it('preserves the presence and bytes of a WAL-mode source database family', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-backtest-wal-readonly-'));
    tempDirectories.push(directory);
    const databasePath = join(directory, 'history.db');
    const sqlite = new Database(databasePath);
    expect(sqlite.pragma('journal_mode = WAL', { simple: true })).toBe('wal');
    sqlite.pragma('wal_autocheckpoint = 0');
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
    const familyPaths = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
    expect(familyPaths.every(existsSync)).toBe(true);
    const before = snapshotFiles(familyPaths);

    const source = loadAdaptiveBacktestDatabase({
      checkIns: [fixture().checkIns[0]],
      databasePath,
      program: fixture().program,
      userId: 'user-1',
    });

    expect(source.weightEntries).toEqual([]);
    expect(snapshotFiles(familyPaths)).toEqual(before);
    sqlite.close();
  });
});
