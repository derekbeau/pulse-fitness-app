import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import bcrypt from 'bcryptjs';
import type Database from 'better-sqlite3';
import { and, eq, gte, like } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { AdaptiveNutritionReadState, AdaptiveProgramMutation } from '@pulse/shared';

import * as schema from '../db/schema/index.js';
import {
  adaptiveNutritionAccountDeletionScope,
  adaptiveNutritionCheckIns,
  adaptiveNutritionPrograms,
  bodyWeight,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
  users,
} from '../db/schema/index.js';
import { createAdaptiveNutritionStore } from '../routes/adaptive-nutrition/store.js';

export const ADAPTIVE_PREVIEW_USERNAME_PREFIX = 'adaptive-preview-';
export const ADAPTIVE_PREVIEW_PASSWORD = 'adaptive-preview-only';

export type AdaptivePreviewFixtureName =
  | 'setup'
  | 'baseline'
  | 'learning'
  | 'updating'
  | 'holding'
  | 'pending'
  | 'goal-reached';

export type AdaptivePreviewFixtureRecord = {
  fixture: AdaptivePreviewFixtureName;
  name: string;
  username: string;
  userId: string;
  expectedState: AdaptiveNutritionReadState;
  note: string;
};

type AdaptiveDatabase = BetterSQLite3Database<typeof schema>;

const FIXTURES: Array<
  Omit<AdaptivePreviewFixtureRecord, 'username' | 'userId'> & { idSuffix: string }
> = [
  {
    fixture: 'setup',
    idSuffix: '0001',
    name: 'Adaptive Preview · Setup',
    expectedState: 'setup_required',
    note: 'No program exists; complete the guided setup.',
  },
  {
    fixture: 'baseline',
    idSuffix: '0002',
    name: 'Adaptive Preview · Baseline',
    expectedState: 'baseline',
    note: 'A baseline was declined, leaving the program ready for a fresh baseline.',
  },
  {
    fixture: 'learning',
    idSuffix: '0003',
    name: 'Adaptive Preview · Learning',
    expectedState: 'learning',
    note: 'The baseline is accepted but recent complete-day coverage is insufficient.',
  },
  {
    fixture: 'updating',
    idSuffix: '0004',
    name: 'Adaptive Preview · Updating',
    expectedState: 'updating',
    note: 'Eligible nutrition and weight history support a manual check-in.',
  },
  {
    fixture: 'holding',
    idSuffix: '0005',
    name: 'Adaptive Preview · Holding',
    expectedState: 'holding',
    note: 'A prior adaptive update exists, but recent weights are now stale.',
  },
  {
    fixture: 'pending',
    idSuffix: '0006',
    name: 'Adaptive Preview · Pending',
    expectedState: 'pending_recommendation',
    note: 'An eligible recommendation is pending after one prior decline.',
  },
  {
    fixture: 'goal-reached',
    idSuffix: '0007',
    name: 'Adaptive Preview · Goal Reached',
    expectedState: 'pending_recommendation',
    note: 'A pending loss recommendation is inside the goal tolerance and will move to maintenance.',
  },
];

const datePlus = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const poundsFromKg = (weightKg: number) => weightKg / 0.45359237;

const programInput = (
  overrides: Partial<AdaptiveProgramMutation> = {},
): AdaptiveProgramMutation => ({
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
  proteinGrams: 160,
  fatAllocationPct: 30,
  userCalorieFloorKcal: 1500,
  currentWeight: { weight: 82, unit: 'kg' },
  rebaseline: false,
  supersedePending: false,
  ...overrides,
});

const requirePendingId = (
  store: ReturnType<typeof createAdaptiveNutritionStore>,
  userId: string,
) => {
  const pending = store.getState(userId).pendingCheckIn;
  if (!pending) throw new Error(`Fixture ${userId} did not produce a pending check-in`);
  return pending.id;
};

const cleanupExistingFixtures = (db: AdaptiveDatabase) => {
  const fixtureUsers = db
    .select({ id: users.id })
    .from(users)
    .where(like(users.username, `${ADAPTIVE_PREVIEW_USERNAME_PREFIX}%`))
    .all();
  for (const fixtureUser of fixtureUsers) {
    db.transaction((tx) => {
      tx.insert(adaptiveNutritionAccountDeletionScope)
        .values({ userId: fixtureUser.id })
        .onConflictDoNothing()
        .run();
      tx.delete(nutritionTargets).where(eq(nutritionTargets.userId, fixtureUser.id)).run();
      tx.delete(adaptiveNutritionCheckIns)
        .where(eq(adaptiveNutritionCheckIns.userId, fixtureUser.id))
        .run();
      tx.delete(adaptiveNutritionPrograms)
        .where(eq(adaptiveNutritionPrograms.userId, fixtureUser.id))
        .run();
      tx.delete(users).where(eq(users.id, fixtureUser.id)).run();
    });
  }
};

const seedEligibleHistory = (
  db: AdaptiveDatabase,
  userId: string,
  anchorDate: string,
  timestamp: number,
  goalWeight = false,
) => {
  for (let offset = -21; offset <= -1; offset += 1) {
    const date = datePlus(anchorDate, offset);
    const logId = `${userId}-log-${date}`;
    const mealId = `${userId}-meal-${date}`;
    db.insert(nutritionLogs)
      .values({
        id: logId,
        userId,
        date,
        status: 'complete',
        statusUpdatedAt: timestamp + offset,
        updatedAt: timestamp + offset,
      })
      .run();
    db.insert(meals)
      .values({ id: mealId, nutritionLogId: logId, name: 'Deterministic daily total' })
      .run();
    db.insert(mealItems)
      .values({
        id: `${userId}-item-${date}`,
        mealId,
        name: 'Fixture total',
        amount: 1,
        unit: 'day',
        calories: 2400,
        protein: 160,
        carbs: 260,
        fat: 80,
      })
      .run();
  }
  const weights = goalWeight
    ? [81.25, 81.24, 81.23, 81.22, 81.21, 81.2, 81.2, 81.2]
    : [82, 81.95, 81.9, 81.85, 81.8, 81.75, 81.7, 81.65];
  [-21, -18, -15, -12, -9, -6, -3, -1].forEach((offset, index) => {
    const date = datePlus(anchorDate, offset);
    const weightKg = weights[index];
    db.insert(bodyWeight)
      .values({
        id: `${userId}-weight-${date}`,
        userId,
        date,
        weight: poundsFromKg(weightKg),
        weightKg,
        unitAtEntry: 'kg',
        updatedAt: timestamp + index,
      })
      .run();
  });
};

export function seedAdaptiveTdeePreviewFixtures(options: {
  anchorDate: string;
  db: AdaptiveDatabase;
  now: Date;
  passwordHash: string;
  sqlite: Database.Database;
}): AdaptivePreviewFixtureRecord[] {
  const { anchorDate, db, passwordHash, sqlite } = options;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
    throw new Error('Preview fixture date must use YYYY-MM-DD');
  }
  cleanupExistingFixtures(db);
  let clock = options.now.getTime();
  const store = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(clock) });
  const records = FIXTURES.map((fixture) => ({
    fixture: fixture.fixture,
    name: fixture.name,
    username: `${ADAPTIVE_PREVIEW_USERNAME_PREFIX}${fixture.fixture}`,
    userId: `a6d0c0de-0000-4000-8000-${fixture.idSuffix.padStart(12, '0')}`,
    expectedState: fixture.expectedState,
    note: fixture.note,
  }));
  db.insert(users)
    .values(
      records.map((record) => ({
        id: record.userId,
        username: record.username,
        name: record.name,
        passwordHash,
        weightUnit: 'lbs' as const,
        createdAt: clock,
        updatedAt: clock,
      })),
    )
    .run();

  const byName = new Map(records.map((record) => [record.fixture, record]));
  const record = (name: AdaptivePreviewFixtureName) => {
    const value = byName.get(name);
    if (!value) throw new Error(`Missing fixture definition: ${name}`);
    return value;
  };
  const createAndAcceptBaseline = (name: AdaptivePreviewFixtureName, input = programInput()) => {
    const fixture = record(name);
    store.upsertProgram(fixture.userId, input);
    clock += 1000;
    store.acceptCheckIn(fixture.userId, requirePendingId(store, fixture.userId), {
      replaceSameDateTarget: false,
    });
    clock += 1000;
    return fixture;
  };

  const baseline = record('baseline');
  store.upsertProgram(baseline.userId, programInput());
  store.declineCheckIn(baseline.userId, requirePendingId(store, baseline.userId));
  clock += 1000;

  createAndAcceptBaseline('learning');

  const updating = createAndAcceptBaseline('updating');
  seedEligibleHistory(db, updating.userId, anchorDate, clock);
  clock += 1000;

  const holding = createAndAcceptBaseline('holding');
  seedEligibleHistory(db, holding.userId, anchorDate, clock);
  const holdingPreview = store.previewCheckIn(holding.userId, {
    kind: 'manual',
    includeToday: false,
  });
  clock += 1000;
  store.acceptCheckIn(holding.userId, holdingPreview.id, { replaceSameDateTarget: true });
  db.delete(bodyWeight)
    .where(
      and(eq(bodyWeight.userId, holding.userId), gte(bodyWeight.date, datePlus(anchorDate, -8))),
    )
    .run();
  clock += 1000;

  const pending = createAndAcceptBaseline('pending');
  seedEligibleHistory(db, pending.userId, anchorDate, clock);
  const declined = store.previewCheckIn(pending.userId, { kind: 'manual', includeToday: false });
  store.declineCheckIn(pending.userId, declined.id);
  clock += 1000;
  store.previewCheckIn(pending.userId, { kind: 'manual', includeToday: false });
  clock += 1000;

  const goal = createAndAcceptBaseline(
    'goal-reached',
    programInput({
      goalType: 'lose',
      targetWeightKg: 81.2,
      goalRatePctPerWeek: -0.5,
    }),
  );
  seedEligibleHistory(db, goal.userId, anchorDate, clock, true);
  store.previewCheckIn(goal.userId, { kind: 'manual', includeToday: false });

  for (const fixture of records) {
    const state = store.getState(fixture.userId);
    if (state.state !== fixture.expectedState) {
      throw new Error(
        `${fixture.fixture} fixture expected ${fixture.expectedState}, received ${state.state}`,
      );
    }
  }
  const goalPending = store.getState(goal.userId).pendingCheckIn;
  if (!goalPending?.reasonCodes.includes('GOAL_REACHED')) {
    throw new Error('Goal-reached fixture did not produce the GOAL_REACHED reason');
  }
  return records;
}

const dateKeyInDetroit = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Detroit',
    year: 'numeric',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const parseArguments = (args: string[]) => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const [key, inlineValue] = argument.split('=', 2);
    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`);
    values.set(key, value);
  }
  return {
    anchorDate: values.get('--date') ?? dateKeyInDetroit(new Date()),
    databasePath: values.get('--database'),
  };
};

const resolveFromInvocation = (path: string) =>
  isAbsolute(path) ? path : resolve(process.env.INIT_CWD ?? process.cwd(), path);

export async function runAdaptiveTdeePreviewSeedCli(args: string[]) {
  const repoRoot = resolve(import.meta.dirname, '../../../..');
  const expectedPath = resolve(repoRoot, 'apps/api/data/pulse-tdee-dev.db');
  const parsed = parseArguments(args);
  const databasePath = resolveFromInvocation(parsed.databasePath ?? expectedPath);
  if (databasePath !== expectedPath) {
    throw new Error('Preview seeding is restricted to apps/api/data/pulse-tdee-dev.db');
  }
  const stat = lstatSync(databasePath);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(databasePath) !== expectedPath) {
    throw new Error('Preview database must be the regular, non-symlink Gate 0 database');
  }
  process.env.DATABASE_URL = expectedPath;
  const [{ db, sqlite }, passwordHash] = await Promise.all([
    import('../db/index.js'),
    bcrypt.hash(ADAPTIVE_PREVIEW_PASSWORD, 4),
  ]);
  const records = seedAdaptiveTdeePreviewFixtures({
    anchorDate: parsed.anchorDate,
    db,
    now: new Date(`${parsed.anchorDate}T16:00:00.000Z`),
    passwordHash,
    sqlite,
  });
  console.log(
    JSON.stringify(
      {
        database: 'apps/api/data/pulse-tdee-dev.db',
        date: parsed.anchorDate,
        password: ADAPTIVE_PREVIEW_PASSWORD,
        users: records,
      },
      null,
      2,
    ),
  );
  sqlite.close();
  return records;
}
