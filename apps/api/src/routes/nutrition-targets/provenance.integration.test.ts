import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionGoalRevisions,
  adaptiveNutritionGoals,
  adaptiveNutritionPrograms,
  nutritionTargets,
  users,
} from '../../db/schema/index.js';

type DatabaseModule = typeof import('../../db/index.js');

let dbModule: DatabaseModule;
let tempDir = '';

const manualTarget = {
  id: 'target-manual',
  calories: 2200,
  protein: 180,
  carbs: 250,
  fat: 70,
  source: 'manual' as const,
  adaptiveCheckInId: null,
  macroCalories: 2350,
  effectiveDate: '2026-03-09',
  createdAt: 100,
  updatedAt: 100,
};

const proposedTarget = {
  calories: 2300,
  protein: 185,
  carbs: 260,
  fat: 75,
  effectiveDate: '2026-03-09',
};

const seedProgramAndCheckIn = (
  currentTargets: typeof manualTarget | null,
  overrides: Partial<typeof adaptiveNutritionCheckIns.$inferInsert> = {},
) => {
  dbModule.db
    .insert(adaptiveNutritionPrograms)
    .values({
      id: 'program-1',
      userId: 'user-1',
      timeZone: 'America/Detroit',
      rmrEquation: 'manual_tdee',
      baselineTdeeKcal: 2500,
      goalType: 'maintain',
      goalRatePctPerWeek: 0,
      proteinGrams: 180,
      fatAllocationPct: 30,
      systemCalorieFloorKcal: 1500,
      userCalorieFloorKcal: 1500,
      algorithmVersion: 'adaptive-tdee-v1',
    })
    .run();
  dbModule.db
    .insert(adaptiveNutritionGoals)
    .values({
      id: 'goal-1',
      userId: 'user-1',
      programId: 'program-1',
      type: 'maintain',
      status: 'active',
      startTrendWeightKg: 80,
      startScaleWeightKg: 80,
      targetWeightKg: null,
      maintenanceCenterKg: 80,
      goalRatePctPerWeek: 0,
      startedLocalDate: '2026-03-09',
    })
    .run();
  dbModule.db
    .insert(adaptiveNutritionGoalRevisions)
    .values({
      id: 'goal-revision-1',
      goalId: 'goal-1',
      userId: 'user-1',
      sequence: 1,
      targetWeightKg: null,
      maintenanceCenterKg: 80,
      goalRatePctPerWeek: 0,
      previousTargetWeightKg: null,
      previousCenterKg: 80,
      previousRatePctPerWeek: 0,
      reason: 'created',
      effectiveLocalDate: '2026-03-09',
    })
    .run();
  dbModule.db
    .insert(adaptiveNutritionCheckIns)
    .values({
      id: 'check-in-1',
      userId: 'user-1',
      programId: 'program-1',
      goalId: 'goal-1',
      goalRevisionId: 'goal-revision-1',
      kind: 'manual',
      status: 'pending',
      calculationState: 'baseline',
      localDate: '2026-03-09',
      includeToday: false,
      algorithmVersion: 'adaptive-tdee-v1',
      dataFingerprint: 'a'.repeat(64),
      inputSnapshot: { version: 1 },
      calculationSnapshot: { version: 1 },
      reasonCodes: [],
      currentTargets,
      proposedTargets: proposedTarget,
      ...overrides,
    })
    .run();
};

describe('nutrition target provenance store', () => {
  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-target-provenance-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    vi.resetModules();
    dbModule = await import('../../db/index.js');
    migrate(dbModule.db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });
  });

  afterAll(() => {
    dbModule.sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.DATABASE_URL;
    vi.resetModules();
  });

  beforeEach(async () => {
    const { deleteUserAccount } = await import('../auth/store.js');
    await deleteUserAccount('user-1');
    await deleteUserAccount('user-2');
    dbModule.db
      .insert(users)
      .values([
        { id: 'user-1', username: 'user-1', passwordHash: 'hash' },
        { id: 'user-2', username: 'user-2', passwordHash: 'hash' },
      ])
      .run();
  });

  it('stores manual provenance and server-derived macro calories', async () => {
    const { upsertNutritionTarget } = await import('./store.js');
    const target = await upsertNutritionTarget('user-1', {
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      effectiveDate: '2026-03-09',
    });

    expect(target).toMatchObject({
      source: 'manual',
      adaptiveCheckInId: null,
      macroCalories: 2350,
    });
  });

  it('requires an owned check-in and exact immutable same-date replacement snapshot', async () => {
    const {
      AdaptiveCheckInNotFoundError,
      ReplacedTargetSnapshotMismatchError,
      SameDateNutritionTargetExistsError,
      persistAdaptiveNutritionTarget,
    } = await import('./store.js');

    dbModule.db
      .insert(nutritionTargets)
      .values({ userId: 'user-1', ...manualTarget })
      .run();
    seedProgramAndCheckIn(manualTarget);

    await expect(
      persistAdaptiveNutritionTarget(
        'user-1',
        'check-in-1',
        {
          calories: 2300,
          protein: 185,
          carbs: 260,
          fat: 75,
          effectiveDate: '2026-03-09',
        },
        false,
      ),
    ).rejects.toBeInstanceOf(SameDateNutritionTargetExistsError);

    const adaptive = await persistAdaptiveNutritionTarget(
      'user-1',
      'check-in-1',
      {
        calories: 2300,
        protein: 185,
        carbs: 260,
        fat: 75,
        effectiveDate: '2026-03-09',
      },
      true,
    );
    expect(adaptive).toMatchObject({
      id: 'target-manual',
      source: 'adaptive',
      adaptiveCheckInId: 'check-in-1',
      macroCalories: 2455,
    });
    expect(
      dbModule.db
        .select({ currentTargets: adaptiveNutritionCheckIns.currentTargets })
        .from(adaptiveNutritionCheckIns)
        .where(eq(adaptiveNutritionCheckIns.id, 'check-in-1'))
        .get(),
    ).toEqual({ currentTargets: manualTarget });

    await expect(
      persistAdaptiveNutritionTarget(
        'user-2',
        'check-in-1',
        {
          calories: 2300,
          protein: 185,
          carbs: 260,
          fat: 75,
          effectiveDate: '2026-03-09',
        },
        true,
      ),
    ).rejects.toBeInstanceOf(AdaptiveCheckInNotFoundError);

    dbModule.db.delete(nutritionTargets).run();
    dbModule.db
      .update(adaptiveNutritionCheckIns)
      .set({ status: 'superseded', resolvedAt: Date.now() })
      .where(eq(adaptiveNutritionCheckIns.id, 'check-in-1'))
      .run();
    dbModule.db
      .insert(adaptiveNutritionCheckIns)
      .values({
        id: 'check-in-mismatch',
        userId: 'user-1',
        programId: 'program-1',
        goalId: 'goal-1',
        goalRevisionId: 'goal-revision-1',
        kind: 'manual',
        status: 'pending',
        calculationState: 'baseline',
        localDate: '2026-03-09',
        includeToday: false,
        algorithmVersion: 'adaptive-tdee-v1',
        dataFingerprint: 'b'.repeat(64),
        inputSnapshot: { version: 1 },
        calculationSnapshot: { version: 1 },
        reasonCodes: [],
        currentTargets: null,
        proposedTargets: { ...proposedTarget, calories: 2400, protein: 190, carbs: 270, fat: 80 },
      })
      .run();
    dbModule.db
      .insert(nutritionTargets)
      .values({ userId: 'user-1', ...manualTarget })
      .run();
    await expect(
      persistAdaptiveNutritionTarget(
        'user-1',
        'check-in-mismatch',
        {
          calories: 2400,
          protein: 190,
          carbs: 270,
          fat: 80,
          effectiveDate: '2026-03-09',
        },
        true,
      ),
    ).rejects.toBeInstanceOf(ReplacedTargetSnapshotMismatchError);
  });

  it('allows a new adaptive date while retaining an earlier current-target snapshot', async () => {
    const { persistAdaptiveNutritionTarget } = await import('./store.js');
    dbModule.db
      .insert(nutritionTargets)
      .values({ userId: 'user-1', ...manualTarget })
      .run();
    seedProgramAndCheckIn(manualTarget, {
      proposedTargets: { ...proposedTarget, effectiveDate: '2026-03-10' },
    });

    await expect(
      persistAdaptiveNutritionTarget(
        'user-1',
        'check-in-1',
        {
          calories: 2300,
          protein: 185,
          carbs: 260,
          fat: 75,
          effectiveDate: '2026-03-10',
        },
        false,
      ),
    ).resolves.toMatchObject({
      source: 'adaptive',
      adaptiveCheckInId: 'check-in-1',
      effectiveDate: '2026-03-10',
    });
  });

  it.each([
    ['held', 'holding'],
    ['declined', 'baseline'],
    ['superseded', 'baseline'],
    ['accepted', 'baseline'],
    ['pending', 'holding'],
  ] as const)(
    'rejects a %s check-in as a target provenance source',
    async (status, calculationState) => {
      const { AdaptiveCheckInNotActionableError, persistAdaptiveNutritionTarget } =
        await import('./store.js');
      seedProgramAndCheckIn(null, { status, calculationState });

      await expect(
        persistAdaptiveNutritionTarget('user-1', 'check-in-1', proposedTarget, false),
      ).rejects.toBeInstanceOf(AdaptiveCheckInNotActionableError);
    },
  );

  it.each([
    ['null', null],
    ['malformed', { calories: 2300 }],
    ['different values', { ...proposedTarget, calories: 2290 }],
    ['different effective date', { ...proposedTarget, effectiveDate: '2026-03-10' }],
    ['unexpected fields', { ...proposedTarget, fabricated: true }],
  ])('rejects %s proposed-target provenance', async (_label, persistedProposal) => {
    const { AdaptiveProposedTargetMismatchError, persistAdaptiveNutritionTarget } =
      await import('./store.js');
    seedProgramAndCheckIn(null, { proposedTargets: persistedProposal });

    await expect(
      persistAdaptiveNutritionTarget('user-1', 'check-in-1', proposedTarget, false),
    ).rejects.toBeInstanceOf(AdaptiveProposedTargetMismatchError);
  });

  it('database-rejects a check-in that claims another user than its program owner', () => {
    seedProgramAndCheckIn(null);
    expect(() =>
      dbModule.db
        .insert(adaptiveNutritionCheckIns)
        .values({
          id: 'cross-user-check-in',
          userId: 'user-2',
          programId: 'program-1',
          goalId: 'goal-1',
          goalRevisionId: 'goal-revision-1',
          kind: 'manual',
          status: 'held',
          calculationState: 'holding',
          localDate: '2026-03-10',
          algorithmVersion: 'adaptive-tdee-v1',
          dataFingerprint: 'b'.repeat(64),
          inputSnapshot: { version: 1 },
          calculationSnapshot: { version: 1 },
          reasonCodes: [],
          currentTargets: null,
          proposedTargets: null,
        })
        .run(),
    ).toThrow(/FOREIGN KEY constraint failed/u);
  });

  it('allows account deletion only through target-first transaction ordering', async () => {
    const { deleteUserAccount } = await import('../auth/store.js');
    dbModule.db
      .insert(nutritionTargets)
      .values({ userId: 'user-1', ...manualTarget })
      .run();
    seedProgramAndCheckIn(manualTarget);
    dbModule.db
      .update(nutritionTargets)
      .set({ source: 'adaptive', adaptiveCheckInId: 'check-in-1' })
      .where(eq(nutritionTargets.id, 'target-manual'))
      .run();

    await expect(deleteUserAccount('user-1')).resolves.toBe(true);
    expect(
      dbModule.db.select({ id: users.id }).from(users).where(eq(users.id, 'user-1')).get(),
    ).toBeUndefined();
    expect(
      dbModule.db
        .select({ id: adaptiveNutritionCheckIns.id })
        .from(adaptiveNutritionCheckIns)
        .where(eq(adaptiveNutritionCheckIns.userId, 'user-1'))
        .all(),
    ).toEqual([]);
    expect(
      dbModule.db
        .select({ id: adaptiveNutritionGoalRevisions.id })
        .from(adaptiveNutritionGoalRevisions)
        .where(eq(adaptiveNutritionGoalRevisions.userId, 'user-1'))
        .all(),
    ).toEqual([]);
    expect(
      dbModule.db
        .select({ id: adaptiveNutritionGoals.id })
        .from(adaptiveNutritionGoals)
        .where(eq(adaptiveNutritionGoals.userId, 'user-1'))
        .all(),
    ).toEqual([]);
    expect(
      dbModule.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, 'user-2'), eq(users.username, 'user-2')))
        .get(),
    ).toEqual({ id: 'user-2' });
  });

  it('rolls account deletion back atomically and never affects another user', async () => {
    const { deleteUserAccount } = await import('../auth/store.js');
    seedProgramAndCheckIn(null);
    dbModule.sqlite.exec(`
      CREATE TABLE account_delete_blocker (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT
      );
      INSERT INTO account_delete_blocker(user_id) VALUES ('user-1');
    `);

    await expect(deleteUserAccount('user-1')).rejects.toThrow(/FOREIGN KEY constraint failed/u);
    expect(
      dbModule.db.select({ id: users.id }).from(users).where(eq(users.id, 'user-1')).get(),
    ).toEqual({ id: 'user-1' });
    expect(
      dbModule.db
        .select({ id: adaptiveNutritionCheckIns.id })
        .from(adaptiveNutritionCheckIns)
        .where(eq(adaptiveNutritionCheckIns.userId, 'user-1'))
        .get(),
    ).toEqual({ id: 'check-in-1' });
    expect(
      dbModule.db.select({ id: users.id }).from(users).where(eq(users.id, 'user-2')).get(),
    ).toEqual({ id: 'user-2' });

    dbModule.sqlite.exec('DROP TABLE account_delete_blocker;');
  });
});
