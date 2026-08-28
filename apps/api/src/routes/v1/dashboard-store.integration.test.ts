import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeEWMA,
  convertWeightFromKg,
  convertWeightToKg,
  type DashboardSnapshot,
} from '@pulse/shared';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bodyWeight, users } from '../../db/schema/index.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

let tempDir = '';
let dbModule: typeof import('../../db/index.js');

const addDays = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const roundDisplayWeight = (value: number) => Number(value.toFixed(8));

const expectedTrendLbs = (entries: { date: string; weightLbs: number }[]) => {
  const result = computeEWMA(
    entries.map(({ date, weightLbs }) => ({
      date,
      weight: convertWeightToKg(weightLbs, 'lbs'),
    })),
  ).at(-1);

  if (!result) {
    throw new Error('Expected at least one weight entry');
  }

  return roundDisplayWeight(convertWeightFromKg(result.trend, 'lbs'));
};

const seedWeight = (userId: string, date: string, weightLbs: number) => {
  dbModule.db
    .insert(bodyWeight)
    .values({
      id: `${userId}-${date}`,
      userId,
      date,
      weight: weightLbs,
      weightKg: convertWeightToKg(weightLbs, 'lbs'),
      unitAtEntry: 'lbs',
    })
    .run();
};

const getSnapshot = async (userId: string, date: string): Promise<DashboardSnapshot> => {
  const { getDashboardSnapshot } = await import('./dashboard-store.js');
  return getDashboardSnapshot(userId, date);
};

describe('dashboard trend-weight window', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-dashboard-trend-'));
    process.env.DATABASE_URL = join(tempDir, 'dashboard.db');
    vi.resetModules();

    dbModule = await import('../../db/index.js');
    migrate(dbModule.db, { migrationsFolder });
    dbModule.db
      .insert(users)
      .values([
        {
          id: 'user-1',
          username: 'dashboard-trend-1',
          passwordHash: 'hash',
          preferences: { timeZone: 'America/Detroit' },
        },
        {
          id: 'user-2',
          username: 'dashboard-trend-2',
          passwordHash: 'hash',
          preferences: { timeZone: 'America/Detroit' },
        },
      ])
      .run();
  });

  afterEach(() => {
    dbModule.sqlite.close();
    process.env.DATABASE_URL = originalDatabaseUrl;
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('uses all daily entries in the inclusive trailing 30-calendar-day window', async () => {
    const requestedDate = '2026-08-17';
    const windowStart = addDays(requestedDate, -29);
    const inWindow = Array.from({ length: 30 }, (_, index) => ({
      date: addDays(windowStart, index),
      weightLbs: 180 - index * 0.1,
    }));

    seedWeight('user-1', addDays(windowStart, -1), 240);
    inWindow.forEach(({ date, weightLbs }) => seedWeight('user-1', date, weightLbs));

    const snapshot = await getSnapshot('user-1', requestedDate);

    expect(snapshot.weight).toEqual({
      value: 177.1,
      trendValue: expectedTrendLbs(inWindow),
      date: requestedDate,
      unit: 'lbs',
    });
  });

  it('prevents sparse measurements from prior months or other users from pulling the trend', async () => {
    const requestedDate = '2026-08-17';
    const recent = [
      { date: '2026-08-01', weightLbs: 178 },
      { date: '2026-08-08', weightLbs: 177 },
      { date: '2026-08-14', weightLbs: 178 },
      { date: requestedDate, weightLbs: 176 },
    ];

    seedWeight('user-1', '2026-03-11', 225);
    seedWeight('user-1', '2026-06-01', 210);
    recent.forEach(({ date, weightLbs }) => seedWeight('user-1', date, weightLbs));
    seedWeight('user-2', requestedDate, 300);

    const snapshot = await getSnapshot('user-1', requestedDate);
    const allHistoryTrend = expectedTrendLbs([
      { date: '2026-03-11', weightLbs: 225 },
      { date: '2026-06-01', weightLbs: 210 },
      ...recent,
    ]);

    expect(snapshot.weight).toMatchObject({
      value: 176,
      date: requestedDate,
      unit: 'lbs',
    });
    expect(snapshot.weight?.trendValue).toBe(expectedTrendLbs(recent));
    expect(snapshot.weight?.trendValue).not.toBe(allHistoryTrend);
  });

  it('anchors a historical snapshot window to the requested date instead of today', async () => {
    const requestedDate = '2026-05-15';
    const historicalWindow = [
      { date: '2026-04-16', weightLbs: 184 },
      { date: '2026-05-01', weightLbs: 182 },
      { date: requestedDate, weightLbs: 180 },
    ];

    seedWeight('user-1', '2026-04-15', 230);
    historicalWindow.forEach(({ date, weightLbs }) => seedWeight('user-1', date, weightLbs));
    seedWeight('user-1', '2026-08-17', 160);

    const snapshot = await getSnapshot('user-1', requestedDate);

    expect(snapshot.weight).toEqual({
      value: 180,
      trendValue: expectedTrendLbs(historicalWindow),
      date: requestedDate,
      unit: 'lbs',
    });
  });

  it('returns no trend for one in-window measurement so the UI falls back to scale weight', async () => {
    seedWeight('user-1', '2026-03-11', 220);
    seedWeight('user-1', '2026-08-12', 181);

    const snapshot = await getSnapshot('user-1', '2026-08-17');

    expect(snapshot.weight).toEqual({
      value: 181,
      trendValue: null,
      date: '2026-08-12',
      unit: 'lbs',
    });
  });

  it('returns no trend when the latest scale weight is outside the window', async () => {
    seedWeight('user-1', '2026-06-01', 185);

    const snapshot = await getSnapshot('user-1', '2026-08-17');

    expect(snapshot.weight).toEqual({
      value: 185,
      trendValue: null,
      date: '2026-06-01',
      unit: 'lbs',
    });
  });

  it('returns no weight snapshot when the user has never logged weight', async () => {
    const snapshot = await getSnapshot('user-1', '2026-08-17');

    expect(snapshot.weight).toBeNull();
  });
});
