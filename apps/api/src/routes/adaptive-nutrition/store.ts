import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import { and, asc, count, desc, eq, gte, isNotNull, lte, max, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import {
  ADAPTIVE_TDEE_CONSTANTS,
  adaptiveAcceptInputSchema,
  adaptiveCheckInDetailSchema,
  adaptiveCheckInInputSnapshotSchema,
  adaptiveCheckInQuerySchema,
  adaptiveCheckInSummarySchema,
  adaptiveCurrentTargetSchema,
  adaptiveCurrentGoalSchema,
  adaptiveGoalCompleteInputSchema,
  adaptiveGoalEditInputSchema,
  adaptiveGoalLifecycleInputSchema,
  adaptiveGoalRevisionSchema,
  adaptiveGoalSchema,
  adaptiveGoalSnapshotSchema,
  adaptiveGoalStartInputSchema,
  adaptiveProgramCalculationSchema,
  adaptiveProgramMutationSchema,
  adaptiveProgramSchema,
  adaptivePreviewInputSchema,
  adaptiveRecommendationSchema,
  addCalendarDays,
  allocateMacros,
  buildAdaptiveRecommendation,
  calculateAdaptiveDateBoundaries,
  calculateAdaptiveSetupProjection,
  calculateBaselineTdee,
  calculateGoalCalories,
  calculateAdaptiveGoalProgress,
  calculateRegressionSlope,
  calculateSystemCalorieFloor,
  calendarDaysBetween,
  convertWeightFromKg,
  convertWeightToKg,
  createAdaptiveInputFingerprint,
  evaluateEligibility,
  nutritionTargetSchema,
  summarizeAdaptiveReadinessEvidence,
  type AdaptiveAcceptInput,
  type AdaptiveAcceptResult,
  type AdaptiveCheckInDetail,
  type AdaptiveCheckInKind,
  type AdaptiveCheckInInputSnapshot,
  type AdaptiveCheckInSummary,
  type AdaptiveGoal,
  type AdaptiveCurrentGoal,
  type AdaptiveGoalCompleteInput,
  type AdaptiveGoalEditInput,
  type AdaptiveGoalLifecycleInput,
  type AdaptiveGoalProgress,
  type AdaptiveGoalRevision,
  type AdaptiveGoalStartInput,
  type AdaptiveNutritionDay,
  type AdaptiveNutritionState,
  type AdaptivePreviewInput,
  type AdaptiveProgram,
  type AdaptiveProgramCalculation,
  type AdaptiveProgramMutation,
  type AdaptiveReviewTargetProposal,
  type AdaptiveRecommendation,
  type AdaptiveWeightEntry,
  type NutritionTarget,
} from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import { insertAdaptiveProgramRevisionProjection } from '../../db/adaptive-program-revision-projection.js';
import { getApplicationNow } from '../../lib/clock.js';
import { resolveUserPreferenceTimeZone } from '../../lib/user-time-zone.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionGoalCompletions,
  adaptiveNutritionGoalRevisions,
  adaptiveNutritionGoals,
  adaptiveNutritionProgramRevisions,
  adaptiveNutritionPrograms,
  bodyWeight,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargetEvents,
  nutritionTargets,
  users,
} from '../../db/schema/index.js';
import {
  AdaptiveGoalNotFoundError,
  adaptiveGoalRevisionSelection,
  adaptiveGoalSelection,
} from './goal-store.js';

type AdaptiveDatabase = BetterSQLite3Database<typeof schema>;

export class AdaptiveProgramNotFoundError extends Error {
  constructor() {
    super('Adaptive nutrition program not found');
    this.name = 'AdaptiveProgramNotFoundError';
  }
}

export class AdaptiveActiveGoalRequiredError extends Error {
  constructor() {
    super('An active adaptive nutrition goal must be configured before continuing');
    this.name = 'AdaptiveActiveGoalRequiredError';
  }
}

export class AdaptiveCurrentWeightRequiredError extends Error {
  constructor() {
    super('A body-weight entry from the last seven local calendar days is required');
    this.name = 'AdaptiveCurrentWeightRequiredError';
  }
}

export class AdaptiveProgramInvalidError extends Error {
  constructor(message = 'Adaptive nutrition program is invalid') {
    super(message);
    this.name = 'AdaptiveProgramInvalidError';
  }
}

export class AdaptiveGoalDirectionError extends Error {
  constructor() {
    super('Target weight must be in the configured goal direction');
    this.name = 'AdaptiveGoalDirectionError';
  }
}

export class AdaptiveCalorieFloorError extends Error {
  constructor() {
    super('User calorie floor cannot be below the system calorie floor');
    this.name = 'AdaptiveCalorieFloorError';
  }
}

export class AdaptivePendingCheckInExistsError extends Error {
  constructor() {
    super('A pending recommendation must be superseded explicitly');
    this.name = 'AdaptivePendingCheckInExistsError';
  }
}

export class AdaptiveCheckInNotFoundError extends Error {
  constructor() {
    super('Adaptive nutrition check-in not found');
    this.name = 'AdaptiveCheckInNotFoundError';
  }
}

export class AdaptiveCheckInNotAcceptableError extends Error {
  constructor() {
    super('Adaptive nutrition check-in is not acceptable');
    this.name = 'AdaptiveCheckInNotAcceptableError';
  }
}

export class AdaptiveCheckInNotDeclinableError extends Error {
  constructor() {
    super('Adaptive nutrition check-in is not declinable');
    this.name = 'AdaptiveCheckInNotDeclinableError';
  }
}

export class AdaptiveCheckInStaleError extends Error {
  constructor() {
    super('Adaptive nutrition check-in inputs changed after preview');
    this.name = 'AdaptiveCheckInStaleError';
  }
}

export class AdaptiveSameDateTargetExistsError extends Error {
  constructor() {
    super('A nutrition target already exists for this effective date');
    this.name = 'AdaptiveSameDateTargetExistsError';
  }
}

export class AdaptiveAlgorithmVersionMismatchError extends Error {
  constructor() {
    super('Adaptive nutrition algorithm version changed after preview');
    this.name = 'AdaptiveAlgorithmVersionMismatchError';
  }
}

export class AdaptiveGoalRevisionConflictError extends Error {
  constructor() {
    super('The adaptive goal revision changed before this operation');
    this.name = 'AdaptiveGoalRevisionConflictError';
  }
}

export class AdaptiveGoalTypeConflictError extends Error {
  constructor(message = 'Goal edits must keep the current direction; use a new goal to change it') {
    super(message);
    this.name = 'AdaptiveGoalTypeConflictError';
  }
}

export class AdaptiveGoalCompletionError extends Error {
  constructor(message = 'The adaptive goal is not ready for completion') {
    super(message);
    this.name = 'AdaptiveGoalCompletionError';
  }
}

const programSelection = {
  id: adaptiveNutritionPrograms.id,
  status: adaptiveNutritionPrograms.status,
  timeZone: adaptiveNutritionPrograms.timeZone,
  heightCm: adaptiveNutritionPrograms.heightCm,
  birthDate: adaptiveNutritionPrograms.birthDate,
  rmrEquation: adaptiveNutritionPrograms.rmrEquation,
  activityLevel: adaptiveNutritionPrograms.activityLevel,
  activityMultiplier: adaptiveNutritionPrograms.activityMultiplier,
  estimatedRmrKcal: adaptiveNutritionPrograms.estimatedRmrKcal,
  calculatedBaselineTdeeKcal: adaptiveNutritionPrograms.calculatedBaselineTdeeKcal,
  manualBaselineTdeeKcal: adaptiveNutritionPrograms.manualBaselineTdeeKcal,
  baselineTdeeKcal: adaptiveNutritionPrograms.baselineTdeeKcal,
  goalType: adaptiveNutritionPrograms.goalType,
  targetWeightKg: adaptiveNutritionPrograms.targetWeightKg,
  goalRatePctPerWeek: adaptiveNutritionPrograms.goalRatePctPerWeek,
  proteinGrams: adaptiveNutritionPrograms.proteinGrams,
  fatAllocationPct: adaptiveNutritionPrograms.fatAllocationPct,
  systemCalorieFloorKcal: adaptiveNutritionPrograms.systemCalorieFloorKcal,
  userCalorieFloorKcal: adaptiveNutritionPrograms.userCalorieFloorKcal,
  algorithmVersion: adaptiveNutritionPrograms.algorithmVersion,
  createdAt: adaptiveNutritionPrograms.createdAt,
  updatedAt: adaptiveNutritionPrograms.updatedAt,
};

const targetSelection = {
  id: nutritionTargets.id,
  calories: nutritionTargets.calories,
  protein: nutritionTargets.protein,
  carbs: nutritionTargets.carbs,
  fat: nutritionTargets.fat,
  source: nutritionTargets.source,
  adaptiveCheckInId: nutritionTargets.adaptiveCheckInId,
  macroCalories: nutritionTargets.macroCalories,
  effectiveDate: nutritionTargets.effectiveDate,
  createdAt: nutritionTargets.createdAt,
  updatedAt: nutritionTargets.updatedAt,
};

const checkInSummarySelection = {
  id: adaptiveNutritionCheckIns.id,
  goalId: adaptiveNutritionCheckIns.goalId,
  goalRevisionId: adaptiveNutritionCheckIns.goalRevisionId,
  kind: adaptiveNutritionCheckIns.kind,
  status: adaptiveNutritionCheckIns.status,
  calculationState: adaptiveNutritionCheckIns.calculationState,
  localDate: adaptiveNutritionCheckIns.localDate,
  analysisStart: adaptiveNutritionCheckIns.analysisStart,
  analysisEnd: adaptiveNutritionCheckIns.analysisEnd,
  includeToday: adaptiveNutritionCheckIns.includeToday,
  algorithmVersion: adaptiveNutritionCheckIns.algorithmVersion,
  dataFingerprint: adaptiveNutritionCheckIns.dataFingerprint,
  reasonCodes: adaptiveNutritionCheckIns.reasonCodes,
  priorTdeeKcal: adaptiveNutritionCheckIns.priorTdeeKcal,
  observedTdeeKcal: adaptiveNutritionCheckIns.observedTdeeKcal,
  proposedTdeeKcal: adaptiveNutritionCheckIns.proposedTdeeKcal,
  currentTargets: adaptiveNutritionCheckIns.currentTargets,
  proposedTargets: adaptiveNutritionCheckIns.proposedTargets,
  acceptedNutritionTargetId: adaptiveNutritionCheckIns.acceptedNutritionTargetId,
  resolvedAt: adaptiveNutritionCheckIns.resolvedAt,
  createdAt: adaptiveNutritionCheckIns.createdAt,
};

const checkInDetailSelection = {
  ...checkInSummarySelection,
  inputSnapshot: adaptiveNutritionCheckIns.inputSnapshot,
  calculationSnapshot: adaptiveNutritionCheckIns.calculationSnapshot,
};

const getDateKeyInTimeZone = (date: Date, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (!year || !month || !day) throw new RangeError('Unable to format time zone');
    return `${year}-${month}-${day}`;
  } catch {
    throw new AdaptiveProgramInvalidError('Unsupported IANA time zone');
  }
};

const parseProgram = (value: unknown): AdaptiveProgram => {
  const result = adaptiveProgramSchema.safeParse(value);
  if (!result.success) throw new AdaptiveProgramInvalidError(result.error.message);
  return result.data;
};

const toCalculationProgram = (program: AdaptiveProgram): AdaptiveProgramCalculation =>
  adaptiveProgramCalculationSchema.parse({
    status: program.status,
    timeZone: program.timeZone,
    rmrEquation: program.rmrEquation,
    heightCm: program.heightCm,
    birthDate: program.birthDate,
    activityLevel: program.activityLevel,
    activityMultiplier: program.activityMultiplier,
    estimatedRmrKcal: program.estimatedRmrKcal,
    calculatedBaselineTdeeKcal: program.calculatedBaselineTdeeKcal,
    manualBaselineTdeeKcal: program.manualBaselineTdeeKcal,
    baselineTdeeKcal: program.baselineTdeeKcal,
    goalType: program.goalType,
    targetWeightKg: program.targetWeightKg,
    goalRatePctPerWeek: program.goalRatePctPerWeek,
    proteinGrams: program.proteinGrams,
    fatAllocationPct: program.fatAllocationPct,
    systemCalorieFloorKcal: program.systemCalorieFloorKcal,
    userCalorieFloorKcal: program.userCalorieFloorKcal,
    algorithmVersion: program.algorithmVersion,
  });

const parseCheckInSummary = (value: unknown): AdaptiveCheckInSummary =>
  adaptiveCheckInSummarySchema.parse(value);

const parseCheckInDetail = (value: unknown): AdaptiveCheckInDetail =>
  adaptiveCheckInDetailSchema.parse(value);

const toFingerprintTarget = (target: NutritionTarget | null) =>
  target === null
    ? null
    : adaptiveCurrentTargetSchema.parse({
        id: target.id,
        calories: target.calories,
        protein: target.protein,
        carbs: target.carbs,
        fat: target.fat,
        source: target.source,
        adaptiveCheckInId: target.adaptiveCheckInId,
        macroCalories: target.macroCalories,
        effectiveDate: target.effectiveDate,
        updatedAt: target.updatedAt,
      });

const targetsMatch = (left: NutritionTarget | null, right: NutritionTarget | null) =>
  JSON.stringify(left) === JSON.stringify(right);

const dedupeReasons = <T>(values: readonly T[]) => [...new Set(values)];

const isCalculationAffectingProgramUpdate = (
  existing: AdaptiveProgram,
  input: AdaptiveProgramMutation,
) =>
  input.rebaseline ||
  input.currentWeight != null ||
  existing.status !== input.status ||
  existing.timeZone !== input.timeZone ||
  existing.heightCm !== input.heightCm ||
  existing.birthDate !== input.birthDate ||
  existing.rmrEquation !== input.rmrEquation ||
  existing.activityLevel !== input.activityLevel ||
  existing.manualBaselineTdeeKcal !== input.manualBaselineTdeeKcal ||
  existing.goalType !== input.goalType ||
  existing.targetWeightKg !== input.targetWeightKg ||
  existing.goalRatePctPerWeek !== input.goalRatePctPerWeek ||
  existing.proteinGrams !== input.proteinGrams ||
  existing.fatAllocationPct !== input.fatAllocationPct ||
  (input.userCalorieFloorKcal !== undefined &&
    existing.userCalorieFloorKcal !== input.userCalorieFloorKcal);

type RecommendationBundle = {
  recommendation: AdaptiveRecommendation;
  inputSnapshot: AdaptiveCheckInInputSnapshot;
  currentTarget: NutritionTarget | null;
};

type ActiveGoalContext = {
  goal: AdaptiveGoal;
  revision: AdaptiveGoalRevision;
};

export const createAdaptiveNutritionStore = (options: {
  db: AdaptiveDatabase;
  sqlite: Database.Database;
  now?: () => Date;
  runInTransaction?: <T>(operation: () => T) => T;
}) => {
  const { db, sqlite } = options;
  const now = options.now ?? getApplicationNow;

  const immediate = <T>(operation: () => T): T =>
    options.runInTransaction
      ? options.runInTransaction(operation)
      : sqlite.transaction(operation).immediate();

  const findProgram = (userId: string): AdaptiveProgram | null => {
    const value = db
      .select(programSelection)
      .from(adaptiveNutritionPrograms)
      .where(eq(adaptiveNutritionPrograms.userId, userId))
      .limit(1)
      .get();
    return value ? parseProgram(value) : null;
  };

  const appendProgramRevision = (
    userId: string,
    program: AdaptiveProgram,
    effectiveAt: number,
    source: 'program_created' | 'program_updated' | 'goal_updated',
  ) => {
    const snapshot = toCalculationProgram(program);
    const previous = db
      .select({
        sequence: adaptiveNutritionProgramRevisions.sequence,
        snapshot: adaptiveNutritionProgramRevisions.snapshot,
      })
      .from(adaptiveNutritionProgramRevisions)
      .where(
        and(
          eq(adaptiveNutritionProgramRevisions.userId, userId),
          eq(adaptiveNutritionProgramRevisions.programId, program.id),
        ),
      )
      .orderBy(desc(adaptiveNutritionProgramRevisions.sequence))
      .limit(1)
      .get();
    if (previous && JSON.stringify(previous.snapshot) === JSON.stringify(snapshot)) return;

    const revisionId = randomUUID();
    const sequence = (previous?.sequence ?? 0) + 1;
    db.insert(adaptiveNutritionProgramRevisions)
      .values({
        id: revisionId,
        programId: program.id,
        userId,
        sequence,
        effectiveAt,
        snapshot,
        source,
        createdAt: effectiveAt,
      })
      .run();
    insertAdaptiveProgramRevisionProjection(sqlite, {
      id: revisionId,
      programId: program.id,
      userId,
      sequence,
      effectiveAt,
      snapshot,
      createdAt: effectiveAt,
    });
  };

  const findActiveGoal = (userId: string, programId: string): ActiveGoalContext | null => {
    const goalRow = db
      .select(adaptiveGoalSelection)
      .from(adaptiveNutritionGoals)
      .where(
        and(
          eq(adaptiveNutritionGoals.userId, userId),
          eq(adaptiveNutritionGoals.programId, programId),
          eq(adaptiveNutritionGoals.status, 'active'),
        ),
      )
      .limit(1)
      .get();
    if (!goalRow) return null;
    const goal = adaptiveGoalSchema.parse(goalRow);
    const revisionRow = db
      .select(adaptiveGoalRevisionSelection)
      .from(adaptiveNutritionGoalRevisions)
      .where(
        and(
          eq(adaptiveNutritionGoalRevisions.userId, userId),
          eq(adaptiveNutritionGoalRevisions.goalId, goal.id),
        ),
      )
      .orderBy(desc(adaptiveNutritionGoalRevisions.sequence))
      .limit(1)
      .get();
    if (!revisionRow) throw new AdaptiveActiveGoalRequiredError();
    return { goal, revision: adaptiveGoalRevisionSchema.parse(revisionRow) };
  };

  const requireActiveGoal = (userId: string, programId: string): ActiveGoalContext => {
    const context = findActiveGoal(userId, programId);
    if (!context) throw new AdaptiveActiveGoalRequiredError();
    return context;
  };

  const toGoalSnapshot = ({ goal, revision }: ActiveGoalContext) =>
    adaptiveGoalSnapshotSchema.parse({
      id: goal.id,
      revisionId: revision.id,
      type: goal.type,
      targetWeightKg: revision.targetWeightKg,
      maintenanceCenterKg: revision.maintenanceCenterKg,
      goalRatePctPerWeek: revision.goalRatePctPerWeek,
    });

  const findCurrentTarget = (userId: string, localDate: string): NutritionTarget | null =>
    db
      .select(targetSelection)
      .from(nutritionTargets)
      .where(
        and(eq(nutritionTargets.userId, userId), lte(nutritionTargets.effectiveDate, localDate)),
      )
      .orderBy(desc(nutritionTargets.effectiveDate))
      .limit(1)
      .get() ?? null;

  const findTargetForDate = (userId: string, localDate: string): NutritionTarget | null =>
    db
      .select(targetSelection)
      .from(nutritionTargets)
      .where(
        and(eq(nutritionTargets.userId, userId), eq(nutritionTargets.effectiveDate, localDate)),
      )
      .limit(1)
      .get() ?? null;

  const findAcceptedTargetSnapshot = (
    userId: string,
    checkInId: string,
    targetId: string,
  ): NutritionTarget | null => {
    const materialized = db
      .select({ id: nutritionTargets.id, createdAt: nutritionTargets.createdAt })
      .from(nutritionTargets)
      .where(and(eq(nutritionTargets.id, targetId), eq(nutritionTargets.userId, userId)))
      .limit(1)
      .get();
    const event = db
      .select({
        targetId: nutritionTargetEvents.targetId,
        calories: nutritionTargetEvents.calories,
        protein: nutritionTargetEvents.protein,
        carbs: nutritionTargetEvents.carbs,
        fat: nutritionTargetEvents.fat,
        source: nutritionTargetEvents.source,
        adaptiveCheckInId: nutritionTargetEvents.adaptiveCheckInId,
        macroCalories: nutritionTargetEvents.macroCalories,
        effectiveDate: nutritionTargetEvents.effectiveDate,
        recordedAt: nutritionTargetEvents.recordedAt,
      })
      .from(nutritionTargetEvents)
      .where(
        and(
          eq(nutritionTargetEvents.targetId, targetId),
          eq(nutritionTargetEvents.userId, userId),
          eq(nutritionTargetEvents.adaptiveCheckInId, checkInId),
        ),
      )
      .limit(1)
      .get();
    if (!materialized || !event) return null;

    return nutritionTargetSchema.parse({
      id: event.targetId,
      calories: event.calories,
      protein: event.protein,
      carbs: event.carbs,
      fat: event.fat,
      source: event.source,
      adaptiveCheckInId: event.adaptiveCheckInId,
      macroCalories: event.macroCalories,
      effectiveDate: event.effectiveDate,
      createdAt: materialized.createdAt,
      updatedAt: event.recordedAt,
    });
  };

  const findLatestAccepted = (
    userId: string,
    programId: string,
    excludeCheckInId?: string,
  ): AdaptiveCheckInSummary | null => {
    const value = db
      .select(checkInSummarySelection)
      .from(adaptiveNutritionCheckIns)
      .where(
        and(
          eq(adaptiveNutritionCheckIns.userId, userId),
          eq(adaptiveNutritionCheckIns.programId, programId),
          eq(adaptiveNutritionCheckIns.status, 'accepted'),
          isNotNull(adaptiveNutritionCheckIns.proposedTdeeKcal),
          excludeCheckInId ? ne(adaptiveNutritionCheckIns.id, excludeCheckInId) : undefined,
        ),
      )
      .orderBy(
        desc(adaptiveNutritionCheckIns.resolvedAt),
        desc(adaptiveNutritionCheckIns.createdAt),
      )
      .limit(1)
      .get();
    return value ? parseCheckInSummary(value) : null;
  };

  const findPending = (userId: string, programId: string): AdaptiveCheckInSummary | null => {
    const value = db
      .select(checkInSummarySelection)
      .from(adaptiveNutritionCheckIns)
      .where(
        and(
          eq(adaptiveNutritionCheckIns.userId, userId),
          eq(adaptiveNutritionCheckIns.programId, programId),
          eq(adaptiveNutritionCheckIns.status, 'pending'),
        ),
      )
      .limit(1)
      .get();
    return value ? parseCheckInSummary(value) : null;
  };

  const findCheckInDetail = (userId: string, checkInId: string): AdaptiveCheckInDetail | null => {
    const value = db
      .select(checkInDetailSelection)
      .from(adaptiveNutritionCheckIns)
      .where(
        and(
          eq(adaptiveNutritionCheckIns.id, checkInId),
          eq(adaptiveNutritionCheckIns.userId, userId),
        ),
      )
      .limit(1)
      .get();
    return value ? parseCheckInDetail(value) : null;
  };

  const loadNutritionDays = (
    userId: string,
    analysisStart: string,
    analysisEnd: string,
  ): AdaptiveNutritionDay[] =>
    db
      .select({
        id: nutritionLogs.id,
        date: nutritionLogs.date,
        status: nutritionLogs.status,
        calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
        itemCount: sql<number>`count(${mealItems.id})`,
        updatedAt: nutritionLogs.updatedAt,
      })
      .from(nutritionLogs)
      .leftJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
      .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
      .where(
        and(
          eq(nutritionLogs.userId, userId),
          gte(nutritionLogs.date, analysisStart),
          lte(nutritionLogs.date, analysisEnd),
        ),
      )
      .groupBy(nutritionLogs.id)
      .orderBy(asc(nutritionLogs.date), asc(nutritionLogs.id))
      .all();

  const loadWeightEntries = (
    userId: string,
    warmupStart: string,
    analysisEnd: string,
  ): AdaptiveWeightEntry[] =>
    db
      .select({
        id: bodyWeight.id,
        date: bodyWeight.date,
        weightKg: bodyWeight.weightKg,
        updatedAt: bodyWeight.updatedAt,
      })
      .from(bodyWeight)
      .where(
        and(
          eq(bodyWeight.userId, userId),
          gte(bodyWeight.date, warmupStart),
          lte(bodyWeight.date, analysisEnd),
        ),
      )
      .orderBy(asc(bodyWeight.date), asc(bodyWeight.id))
      .all();

  const buildRecommendationBundle = (
    userId: string,
    program: AdaptiveProgram,
    goalContext: ActiveGoalContext,
    input: {
      kind: AdaptiveCheckInKind;
      includeToday: boolean;
      localDate: string;
      excludeAcceptedCheckInId?: string;
    },
  ): RecommendationBundle => {
    const calculationProgram = toCalculationProgram(program);
    const boundaries = calculateAdaptiveDateBoundaries(input.localDate, input.includeToday);
    const nutritionDays = loadNutritionDays(
      userId,
      boundaries.analysisStart,
      boundaries.analysisEnd,
    );
    const weightEntries = loadWeightEntries(userId, boundaries.warmupStart, boundaries.analysisEnd);
    const accepted = findLatestAccepted(userId, program.id, input.excludeAcceptedCheckInId);
    const priorTdee =
      accepted?.proposedTdeeKcal == null
        ? null
        : { checkInId: accepted.id, tdeeKcal: accepted.proposedTdeeKcal };
    const currentTarget = findCurrentTarget(userId, input.localDate);
    const inputSnapshot = adaptiveCheckInInputSnapshotSchema.parse({
      version: 2,
      constants: ADAPTIVE_TDEE_CONSTANTS,
      program: calculationProgram,
      priorTdee,
      currentTarget: toFingerprintTarget(currentTarget),
      boundaries,
      includeToday: input.includeToday,
      nutritionDays,
      weightEntries,
      goal: toGoalSnapshot(goalContext),
    });
    let recommendation = adaptiveRecommendationSchema.parse(
      buildAdaptiveRecommendation({
        localDate: input.localDate,
        kind: input.kind,
        includeToday: input.includeToday,
        program: calculationProgram,
        nutritionDays,
        weightEntries,
        priorTdee,
        currentTarget: toFingerprintTarget(currentTarget),
        constants: ADAPTIVE_TDEE_CONSTANTS,
      }),
    );
    recommendation = {
      ...recommendation,
      inputFingerprint: createAdaptiveInputFingerprint(inputSnapshot),
    };
    if (findTargetForDate(userId, input.localDate)) {
      recommendation = {
        ...recommendation,
        reasonCodes: dedupeReasons([...recommendation.reasonCodes, 'SAME_DATE_TARGET_EXISTS']),
      };
    }
    return { recommendation, inputSnapshot, currentTarget };
  };

  const buildGoalChangeBundle = (
    userId: string,
    program: AdaptiveProgram,
    goalContext: ActiveGoalContext,
    localDate: string,
  ): RecommendationBundle => {
    const bundle = buildRecommendationBundle(userId, program, goalContext, {
      kind: 'goal_change',
      includeToday: false,
      localDate,
    });
    const latestAccepted = findLatestAccepted(userId, program.id);
    const acceptedDetail = latestAccepted ? findCheckInDetail(userId, latestAccepted.id) : null;
    const acceptedTdeeKcal = latestAccepted?.proposedTdeeKcal ?? program.baselineTdeeKcal;
    const latestTrendWeightKg = bundle.recommendation.latestTrendWeightKg;
    if (latestTrendWeightKg === null) throw new AdaptiveCurrentWeightRequiredError();
    const eligibility = evaluateEligibility({
      boundaries: bundle.inputSnapshot.boundaries,
      nutritionDays: bundle.inputSnapshot.nutritionDays,
      weightEntries: bundle.inputSnapshot.weightEntries,
    });
    const weightTrendKgPerDay =
      eligibility.trendPoints.length >= 2
        ? calculateRegressionSlope(eligibility.trendPoints.map((point) => point.trendWeightKg))
        : 0;
    const confidence = acceptedDetail?.calculationSnapshot.confidence ?? {
      score: 0,
      label: 'Developing' as const,
      nutritionCoverage: 0,
      weightFrequency: 0,
      spanScore: 0,
      recencyScore: 0,
    };
    const goal = calculateGoalCalories({
      goalType: program.goalType,
      goalRatePctPerWeek: program.goalRatePctPerWeek,
      targetWeightKg: program.targetWeightKg,
      latestTrendWeightKg,
      adaptiveTdeeKcal: acceptedTdeeKcal,
      systemCalorieFloorKcal: program.systemCalorieFloorKcal,
      userCalorieFloorKcal: program.userCalorieFloorKcal,
    });
    const macros = allocateMacros({
      goalCalories: goal.goalCalories,
      proteinGrams: program.proteinGrams,
      fatAllocationPct: program.fatAllocationPct,
    });
    const recommendation = adaptiveRecommendationSchema.parse({
      ...bundle.recommendation,
      kind: 'goal_change',
      state: 'updating',
      reasonCodes: dedupeReasons([
        ...goal.reasonCodes,
        ...(findTargetForDate(userId, localDate) ? (['SAME_DATE_TARGET_EXISTS'] as const) : []),
      ]),
      weightTrendKgPerDay,
      observedTdeeKcal: acceptedTdeeKcal,
      confidence,
      priorTdeeKcal: acceptedTdeeKcal,
      adaptiveUpdate: {
        priorTdeeKcal: acceptedTdeeKcal,
        observedTdeeKcal: acceptedTdeeKcal,
        blendedTdeeKcal: acceptedTdeeKcal,
        requestedChangeKcal: 0,
        limitedChangeKcal: 0,
        proposedTdeeKcal: acceptedTdeeKcal,
        limited: false,
        reasonCodes: [],
      },
      goal,
      macros,
    });
    return { ...bundle, recommendation };
  };

  const findLatestScaleWeight = (userId: string, localDate: string) =>
    db
      .select({ date: bodyWeight.date, weightKg: bodyWeight.weightKg })
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), lte(bodyWeight.date, localDate)))
      .orderBy(desc(bodyWeight.date), desc(bodyWeight.updatedAt))
      .limit(1)
      .get() ?? null;

  const buildGoalProgress = (
    userId: string,
    program: AdaptiveProgram,
    goalContext: ActiveGoalContext,
    localDate: string,
  ): AdaptiveGoalProgress => {
    const boundaries = calculateAdaptiveDateBoundaries(localDate, false);
    const eligibility = evaluateEligibility({
      boundaries,
      nutritionDays: loadNutritionDays(userId, boundaries.analysisStart, boundaries.analysisEnd),
      weightEntries: loadWeightEntries(userId, boundaries.warmupStart, boundaries.analysisEnd),
    });
    const latestScale = findLatestScaleWeight(userId, localDate);
    const currentTrendWeightKg = eligibility.trendPoints.at(-1)?.trendWeightKg ?? null;
    const recommendation = buildRecommendationBundle(userId, program, goalContext, {
      kind: 'manual',
      includeToday: false,
      localDate,
    }).recommendation;
    return calculateAdaptiveGoalProgress({
      goal: goalContext.goal,
      revision: goalContext.revision,
      currentLocalDate: localDate,
      currentTrendWeightKg,
      latestScaleWeightKg: latestScale?.weightKg ?? null,
      latestWeightAgeDays:
        latestScale === null ? null : calendarDaysBetween(latestScale.date, localDate),
      confidence: recommendation.confidence?.label ?? null,
      trendPoints: eligibility.trendPoints.map((point) => ({
        date: point.date,
        trendWeightKg: point.trendWeightKg,
      })),
    });
  };

  const getCurrentGoal = (userId: string): AdaptiveCurrentGoal => {
    const program = findProgram(userId);
    if (!program) throw new AdaptiveProgramNotFoundError();
    const goalContext = findActiveGoal(userId, program.id);
    if (!goalContext) throw new AdaptiveGoalNotFoundError();
    const localDate = getDateKeyInTimeZone(now(), program.timeZone);
    const progress = buildGoalProgress(userId, program, goalContext, localDate);
    const pending = findPending(userId, program.id);
    const latestAccepted = findLatestAccepted(userId, program.id);
    const completionReady =
      goalContext.goal.type !== 'maintain' &&
      progress.kind === 'weight_change' &&
      latestAccepted?.goalId === goalContext.goal.id &&
      latestAccepted.goalRevisionId === goalContext.revision.id &&
      latestAccepted.status === 'accepted' &&
      Boolean(findCheckInDetail(userId, latestAccepted.id)?.calculationSnapshot.goal?.goalReached);
    return adaptiveCurrentGoalSchema.parse({
      goal: goalContext.goal,
      latestRevision: goalContext.revision,
      progress,
      pendingGoalChange: pending?.kind === 'goal_change' ? pending : null,
      allowedActions: {
        edit: true,
        startNew: true,
        cancel: true,
        complete: completionReady,
      },
    });
  };

  const getRecentOrEnteredWeight = (
    userId: string,
    localDate: string,
    input: AdaptiveProgramMutation,
    timestamp: number,
    requireRecent: boolean,
  ) => {
    if (input.currentWeight) {
      const user = db
        .select({ weightUnit: users.weightUnit })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .get();
      if (!user) throw new AdaptiveProgramInvalidError('Authenticated user not found');
      const unit = input.currentWeight.unit ?? user.weightUnit;
      const weightKg = convertWeightToKg(input.currentWeight.weight, unit);
      if (weightKg < 25 || weightKg > 350) {
        throw new AdaptiveProgramInvalidError('Weight must be between 25 and 350 kg');
      }
      const persisted = db
        .insert(bodyWeight)
        .values({
          userId,
          date: localDate,
          weight: convertWeightFromKg(weightKg, 'lbs'),
          weightKg,
          unitAtEntry: unit,
          notes: null,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: [bodyWeight.userId, bodyWeight.date],
          set: {
            weight: convertWeightFromKg(weightKg, 'lbs'),
            weightKg,
            unitAtEntry: unit,
            updatedAt: timestamp,
          },
        })
        .returning({
          id: bodyWeight.id,
          date: bodyWeight.date,
          weightKg: bodyWeight.weightKg,
          updatedAt: bodyWeight.updatedAt,
        })
        .get();
      if (!persisted) throw new AdaptiveProgramInvalidError('Failed to persist current weight');
      return persisted;
    }

    const recent = db
      .select({
        id: bodyWeight.id,
        date: bodyWeight.date,
        weightKg: bodyWeight.weightKg,
        updatedAt: bodyWeight.updatedAt,
      })
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), lte(bodyWeight.date, localDate)))
      .orderBy(desc(bodyWeight.date))
      .limit(1)
      .get();
    if (!recent || (requireRecent && calendarDaysBetween(recent.date, localDate) > 7)) {
      throw new AdaptiveCurrentWeightRequiredError();
    }
    return recent;
  };

  const buildBaselineBundle = (
    userId: string,
    program: AdaptiveProgram,
    goalContext: ActiveGoalContext,
    currentWeight: AdaptiveWeightEntry,
    localDate: string,
  ): RecommendationBundle => {
    const calculationProgram = toCalculationProgram(program);
    const boundaries = calculateAdaptiveDateBoundaries(localDate, true);
    const currentTarget = findCurrentTarget(userId, localDate);
    const inputSnapshot = adaptiveCheckInInputSnapshotSchema.parse({
      version: 2,
      constants: ADAPTIVE_TDEE_CONSTANTS,
      program: calculationProgram,
      priorTdee: null,
      currentTarget: toFingerprintTarget(currentTarget),
      boundaries,
      includeToday: true,
      nutritionDays: [],
      weightEntries: [currentWeight],
      goal: toGoalSnapshot(goalContext),
    });
    const inputFingerprint = createAdaptiveInputFingerprint(inputSnapshot);
    const setupProjection = calculateAdaptiveSetupProjection({
      baselineTdeeKcal: calculationProgram.baselineTdeeKcal,
      calculationLocalDate: localDate,
      currentWeightKg: currentWeight.weightKg,
      estimatedRmrKcal: calculationProgram.estimatedRmrKcal,
      fatAllocationPct: calculationProgram.fatAllocationPct,
      goalRatePctPerWeek: calculationProgram.goalRatePctPerWeek,
      goalType: calculationProgram.goalType,
      proteinGrams: calculationProgram.proteinGrams,
      systemCalorieFloorKcal: calculationProgram.systemCalorieFloorKcal,
      targetWeightKg: calculationProgram.targetWeightKg,
      userCalorieFloorKcal: calculationProgram.userCalorieFloorKcal,
    });
    const { goal, macros } = setupProjection;
    const reasonCodes = findTargetForDate(userId, localDate)
      ? (['SAME_DATE_TARGET_EXISTS'] as const)
      : [];
    const recommendation: AdaptiveRecommendation = {
      algorithmVersion: 'adaptive-tdee-v1',
      inputFingerprint,
      kind: 'baseline',
      state: 'baseline',
      boundaries,
      reasonCodes: [...reasonCodes, ...goal.reasonCodes],
      suspectWeightEntryIds: [],
      suspectWeightEntries: [],
      excludedNutritionDates: [],
      completeNutritionDays: 0,
      actualWeightCount: 1,
      trendPointCount: 1,
      averageDailyIntakeKcal: null,
      weightTrendKgPerDay: null,
      observedTdeeKcal: null,
      confidence: null,
      priorTdeeKcal: calculationProgram.baselineTdeeKcal,
      adaptiveUpdate: null,
      latestTrendWeightKg: currentWeight.weightKg,
      goal,
      macros,
    };
    return { recommendation, inputSnapshot, currentTarget };
  };

  const insertCheckIn = (
    userId: string,
    programId: string,
    goalContext: ActiveGoalContext,
    bundle: RecommendationBundle,
    localDate: string,
    timestamp: number,
  ): AdaptiveCheckInDetail => {
    const { recommendation } = bundle;
    const proposedTargets = recommendation.macros
      ? {
          calories: recommendation.macros.calories,
          protein: recommendation.macros.protein,
          carbs: recommendation.macros.carbs,
          fat: recommendation.macros.fat,
          effectiveDate: localDate,
        }
      : null;
    const status =
      recommendation.state === 'baseline' || recommendation.state === 'updating'
        ? 'pending'
        : 'held';
    const value = db
      .insert(adaptiveNutritionCheckIns)
      .values({
        id: randomUUID(),
        userId,
        programId,
        goalId: goalContext.goal.id,
        goalRevisionId: goalContext.revision.id,
        kind: recommendation.kind,
        status,
        calculationState: recommendation.state,
        localDate,
        analysisStart:
          recommendation.state === 'baseline' ? null : recommendation.boundaries.analysisStart,
        analysisEnd:
          recommendation.state === 'baseline' ? null : recommendation.boundaries.analysisEnd,
        includeToday: bundle.inputSnapshot.includeToday,
        algorithmVersion: recommendation.algorithmVersion,
        dataFingerprint: recommendation.inputFingerprint,
        inputSnapshot: bundle.inputSnapshot,
        calculationSnapshot: recommendation,
        reasonCodes: recommendation.reasonCodes,
        priorTdeeKcal: recommendation.priorTdeeKcal,
        observedTdeeKcal: recommendation.observedTdeeKcal,
        proposedTdeeKcal:
          recommendation.adaptiveUpdate?.proposedTdeeKcal ??
          (recommendation.state === 'baseline' ? recommendation.priorTdeeKcal : null),
        currentTargets: bundle.currentTarget,
        proposedTargets,
        createdAt: timestamp,
      })
      .returning(checkInDetailSelection)
      .get();
    if (!value) throw new Error('Failed to persist adaptive nutrition check-in');
    return parseCheckInDetail(value);
  };

  const upsertProgram = (userId: string, rawInput: AdaptiveProgramMutation): AdaptiveProgram => {
    const input = adaptiveProgramMutationSchema.parse(rawInput);
    return immediate(() => {
      const timestamp = now().getTime();
      const localDate = getDateKeyInTimeZone(new Date(timestamp), input.timeZone);
      const existing = findProgram(userId);
      const pending = existing ? findPending(userId, existing.id) : null;
      const calculationAffecting = existing
        ? isCalculationAffectingProgramUpdate(existing, input)
        : true;
      if (pending && calculationAffecting && !input.supersedePending) {
        throw new AdaptivePendingCheckInExistsError();
      }
      if (pending && calculationAffecting) {
        db.update(adaptiveNutritionCheckIns)
          .set({ status: 'superseded', resolvedAt: timestamp })
          .where(
            and(
              eq(adaptiveNutritionCheckIns.id, pending.id),
              eq(adaptiveNutritionCheckIns.userId, userId),
            ),
          )
          .run();
      }

      const shouldRebaseline = existing === null || input.rebaseline;
      const currentWeight = getRecentOrEnteredWeight(
        userId,
        localDate,
        input,
        timestamp,
        shouldRebaseline,
      );
      if (
        (input.goalType === 'lose' &&
          input.targetWeightKg !== null &&
          input.targetWeightKg >= currentWeight.weightKg) ||
        (input.goalType === 'gain' &&
          input.targetWeightKg !== null &&
          input.targetWeightKg <= currentWeight.weightKg)
      ) {
        throw new AdaptiveGoalDirectionError();
      }

      const baseline = shouldRebaseline
        ? calculateBaselineTdee({
            equation: input.rmrEquation,
            weightKg: currentWeight.weightKg,
            heightCm: input.heightCm,
            birthDate: input.birthDate,
            activityLevel: input.activityLevel,
            manualBaselineTdeeKcal: input.manualBaselineTdeeKcal,
            calculationDate: localDate,
          })
        : {
            activityMultiplier: existing.activityMultiplier,
            estimatedRmrKcal: existing.estimatedRmrKcal,
            calculatedBaselineTdeeKcal: existing.calculatedBaselineTdeeKcal,
            baselineTdeeKcal: existing.baselineTdeeKcal,
          };
      const systemCalorieFloorKcal = shouldRebaseline
        ? calculateSystemCalorieFloor(baseline.baselineTdeeKcal)
        : existing.systemCalorieFloorKcal;
      const inheritedUserFloor = existing?.userCalorieFloorKcal ?? systemCalorieFloorKcal;
      const userCalorieFloorKcal =
        input.userCalorieFloorKcal ?? Math.max(inheritedUserFloor, systemCalorieFloorKcal);
      if (userCalorieFloorKcal < systemCalorieFloorKcal) throw new AdaptiveCalorieFloorError();

      const calculation = adaptiveProgramCalculationSchema.safeParse({
        status: input.status,
        timeZone: input.timeZone,
        rmrEquation: input.rmrEquation,
        heightCm: input.heightCm,
        birthDate: input.birthDate,
        activityLevel: input.activityLevel,
        activityMultiplier: baseline.activityMultiplier,
        estimatedRmrKcal: baseline.estimatedRmrKcal,
        calculatedBaselineTdeeKcal: baseline.calculatedBaselineTdeeKcal,
        manualBaselineTdeeKcal: input.manualBaselineTdeeKcal,
        baselineTdeeKcal: baseline.baselineTdeeKcal,
        goalType: input.goalType,
        targetWeightKg: input.targetWeightKg,
        goalRatePctPerWeek: input.goalRatePctPerWeek,
        proteinGrams: input.proteinGrams,
        fatAllocationPct: input.fatAllocationPct,
        systemCalorieFloorKcal,
        userCalorieFloorKcal,
        algorithmVersion: 'adaptive-tdee-v1',
      });
      if (!calculation.success) throw new AdaptiveProgramInvalidError(calculation.error.message);

      const values = {
        userId,
        ...calculation.data,
        updatedAt: timestamp,
      };
      const persisted = existing
        ? db
            .update(adaptiveNutritionPrograms)
            .set(values)
            .where(
              and(
                eq(adaptiveNutritionPrograms.id, existing.id),
                eq(adaptiveNutritionPrograms.userId, userId),
              ),
            )
            .returning(programSelection)
            .get()
        : db
            .insert(adaptiveNutritionPrograms)
            .values({ id: randomUUID(), ...values, createdAt: timestamp })
            .returning(programSelection)
            .get();
      if (!persisted) throw new Error('Failed to persist adaptive nutrition program');
      const program = parseProgram(persisted);
      if (!existing || calculationAffecting) {
        appendProgramRevision(
          userId,
          program,
          timestamp,
          existing ? 'program_updated' : 'program_created',
        );
      }
      let goalContext = findActiveGoal(userId, program.id);
      if (!goalContext) {
        const goalId = randomUUID();
        const revisionId = randomUUID();
        const maintenanceCenterKg =
          program.goalType === 'maintain'
            ? (program.targetWeightKg ?? currentWeight.weightKg)
            : null;
        const targetWeightKg = program.goalType === 'maintain' ? null : program.targetWeightKg;
        const goal = db
          .insert(adaptiveNutritionGoals)
          .values({
            id: goalId,
            userId,
            programId: program.id,
            type: program.goalType,
            status: 'active',
            startTrendWeightKg: currentWeight.weightKg,
            startScaleWeightKg: currentWeight.weightKg,
            targetWeightKg,
            maintenanceCenterKg,
            goalRatePctPerWeek: program.goalRatePctPerWeek,
            startedLocalDate: localDate,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .returning(adaptiveGoalSelection)
          .get();
        const revision = db
          .insert(adaptiveNutritionGoalRevisions)
          .values({
            id: revisionId,
            goalId,
            userId,
            sequence: 1,
            targetWeightKg,
            maintenanceCenterKg,
            goalRatePctPerWeek: program.goalRatePctPerWeek,
            previousTargetWeightKg: targetWeightKg,
            previousCenterKg: maintenanceCenterKg,
            previousRatePctPerWeek: program.goalRatePctPerWeek,
            reason: 'created',
            effectiveLocalDate: localDate,
            createdAt: timestamp,
          })
          .returning(adaptiveGoalRevisionSelection)
          .get();
        if (!goal || !revision) throw new Error('Failed to persist adaptive nutrition goal');
        goalContext = {
          goal: adaptiveGoalSchema.parse(goal),
          revision: adaptiveGoalRevisionSchema.parse(revision),
        };
      } else if (
        goalContext.goal.type !== program.goalType ||
        (goalContext.goal.type !== 'maintain' &&
          goalContext.goal.targetWeightKg !== program.targetWeightKg) ||
        goalContext.goal.goalRatePctPerWeek !== program.goalRatePctPerWeek
      ) {
        throw new AdaptiveProgramInvalidError(
          'Goal strategy changes must use the dedicated goal endpoints',
        );
      }
      if (shouldRebaseline) {
        insertCheckIn(
          userId,
          program.id,
          goalContext,
          buildBaselineBundle(userId, program, goalContext, currentWeight, localDate),
          localDate,
          timestamp,
        );
      }
      return program;
    });
  };

  const supersedePendingRecommendation = (
    userId: string,
    programId: string,
    timestamp: number,
    explicit: boolean,
  ) => {
    const pending = findPending(userId, programId);
    if (!pending) return;
    if (!explicit) throw new AdaptivePendingCheckInExistsError();
    db.update(adaptiveNutritionCheckIns)
      .set({ status: 'superseded', resolvedAt: timestamp })
      .where(
        and(
          eq(adaptiveNutritionCheckIns.id, pending.id),
          eq(adaptiveNutritionCheckIns.userId, userId),
          eq(adaptiveNutritionCheckIns.status, 'pending'),
        ),
      )
      .run();
  };

  const requireFreshTrendWeight = (
    userId: string,
    program: AdaptiveProgram,
    goalContext: ActiveGoalContext | null,
    localDate: string,
  ): number => {
    const boundaries = calculateAdaptiveDateBoundaries(localDate, false);
    const eligibility = evaluateEligibility({
      boundaries,
      nutritionDays: loadNutritionDays(userId, boundaries.analysisStart, boundaries.analysisEnd),
      weightEntries: loadWeightEntries(userId, boundaries.warmupStart, boundaries.analysisEnd),
    });
    const currentTrendWeightKg = eligibility.trendPoints.at(-1)?.trendWeightKg ?? null;
    if (
      currentTrendWeightKg === null ||
      eligibility.latestWeightAgeDays === null ||
      eligibility.latestWeightAgeDays > ADAPTIVE_TDEE_CONSTANTS.maximumWeightAgeDays
    ) {
      throw new AdaptiveCurrentWeightRequiredError();
    }
    if (goalContext) {
      const snapshot = toGoalSnapshot(goalContext);
      if (snapshot.id !== goalContext.goal.id) throw new AdaptiveActiveGoalRequiredError();
    }
    return currentTrendWeightKg;
  };

  const validateGoalTargetDirection = (
    type: AdaptiveGoal['type'],
    targetWeightKg: number | null,
    currentTrendWeightKg: number,
  ) => {
    if (
      (type === 'lose' && (targetWeightKg === null || targetWeightKg >= currentTrendWeightKg)) ||
      (type === 'gain' && (targetWeightKg === null || targetWeightKg <= currentTrendWeightKg))
    ) {
      throw new AdaptiveGoalDirectionError();
    }
  };

  const persistGoalChangeRecommendation = (
    userId: string,
    program: AdaptiveProgram,
    goalContext: ActiveGoalContext,
    localDate: string,
    timestamp: number,
  ) =>
    insertCheckIn(
      userId,
      program.id,
      goalContext,
      buildGoalChangeBundle(userId, program, goalContext, localDate),
      localDate,
      timestamp,
    );

  const editGoal = (
    userId: string,
    goalId: string,
    rawInput: AdaptiveGoalEditInput,
  ): AdaptiveCurrentGoal => {
    const input = adaptiveGoalEditInputSchema.parse(rawInput);
    return immediate(() => {
      const timestamp = now().getTime();
      const program = findProgram(userId);
      if (!program) throw new AdaptiveProgramNotFoundError();
      const current = requireActiveGoal(userId, program.id);
      if (current.goal.id !== goalId) throw new AdaptiveGoalNotFoundError();
      if (input.expectedRevisionId && input.expectedRevisionId !== current.revision.id) {
        throw new AdaptiveGoalRevisionConflictError();
      }
      if (input.type !== current.goal.type) throw new AdaptiveGoalTypeConflictError();
      supersedePendingRecommendation(
        userId,
        program.id,
        timestamp,
        input.supersedePendingRecommendation,
      );
      const localDate = getDateKeyInTimeZone(new Date(timestamp), program.timeZone);
      const currentTrendWeightKg = requireFreshTrendWeight(userId, program, current, localDate);
      validateGoalTargetDirection(input.type, input.targetWeightKg, currentTrendWeightKg);
      const revisionRow = db
        .insert(adaptiveNutritionGoalRevisions)
        .values({
          id: randomUUID(),
          goalId,
          userId,
          sequence: current.revision.sequence + 1,
          targetWeightKg: input.targetWeightKg,
          maintenanceCenterKg: input.maintenanceCenterKg,
          goalRatePctPerWeek: input.goalRatePctPerWeek,
          previousTargetWeightKg: current.revision.targetWeightKg,
          previousCenterKg: current.revision.maintenanceCenterKg,
          previousRatePctPerWeek: current.revision.goalRatePctPerWeek,
          reason: 'user_edit',
          effectiveLocalDate: localDate,
          createdAt: timestamp,
        })
        .returning(adaptiveGoalRevisionSelection)
        .get();
      if (!revisionRow) throw new Error('Failed to append adaptive goal revision');
      const updatedRow = db
        .select(adaptiveGoalSelection)
        .from(adaptiveNutritionGoals)
        .where(
          and(
            eq(adaptiveNutritionGoals.id, goalId),
            eq(adaptiveNutritionGoals.userId, userId),
            eq(adaptiveNutritionGoals.status, 'active'),
          ),
        )
        .limit(1)
        .get();
      if (!updatedRow) throw new AdaptiveGoalNotFoundError();
      const programRow = db
        .update(adaptiveNutritionPrograms)
        .set({
          goalType: input.type,
          targetWeightKg: input.targetWeightKg,
          goalRatePctPerWeek: input.goalRatePctPerWeek,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(adaptiveNutritionPrograms.id, program.id),
            eq(adaptiveNutritionPrograms.userId, userId),
          ),
        )
        .returning(programSelection)
        .get();
      if (!programRow) throw new Error('Failed to update adaptive program goal mirror');
      const updatedProgram = parseProgram(programRow);
      appendProgramRevision(userId, updatedProgram, timestamp, 'goal_updated');
      const updatedContext = {
        goal: adaptiveGoalSchema.parse(updatedRow),
        revision: adaptiveGoalRevisionSchema.parse(revisionRow),
      };
      persistGoalChangeRecommendation(userId, updatedProgram, updatedContext, localDate, timestamp);
      return getCurrentGoal(userId);
    });
  };

  const startGoal = (userId: string, rawInput: AdaptiveGoalStartInput): AdaptiveCurrentGoal => {
    const input = adaptiveGoalStartInputSchema.parse(rawInput);
    return immediate(() => {
      const timestamp = now().getTime();
      const program = findProgram(userId);
      if (!program) throw new AdaptiveProgramNotFoundError();
      const current = findActiveGoal(userId, program.id);
      if (current?.goal.type === input.type) {
        throw new AdaptiveGoalTypeConflictError('Same-direction changes must edit the active goal');
      }
      supersedePendingRecommendation(
        userId,
        program.id,
        timestamp,
        input.supersedePendingRecommendation,
      );
      const localDate = getDateKeyInTimeZone(new Date(timestamp), program.timeZone);
      const startTrendWeightKg = requireFreshTrendWeight(userId, program, current, localDate);
      validateGoalTargetDirection(input.type, input.targetWeightKg, startTrendWeightKg);
      if (current) {
        db.update(adaptiveNutritionGoals)
          .set({
            status: 'replaced',
            finalTrendWeightKg: startTrendWeightKg,
            endedLocalDate: localDate,
            endedReason: 'direction_changed',
            updatedAt: timestamp,
          })
          .where(
            and(
              eq(adaptiveNutritionGoals.id, current.goal.id),
              eq(adaptiveNutritionGoals.userId, userId),
              eq(adaptiveNutritionGoals.status, 'active'),
            ),
          )
          .run();
      }
      const latestScale = findLatestScaleWeight(userId, localDate);
      const goalId = randomUUID();
      const goalRow = db
        .insert(adaptiveNutritionGoals)
        .values({
          id: goalId,
          userId,
          programId: program.id,
          type: input.type,
          status: 'active',
          startTrendWeightKg,
          startScaleWeightKg: latestScale?.weightKg ?? null,
          targetWeightKg: input.targetWeightKg,
          maintenanceCenterKg: input.maintenanceCenterKg,
          goalRatePctPerWeek: input.goalRatePctPerWeek,
          startedLocalDate: localDate,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning(adaptiveGoalSelection)
        .get();
      const revisionRow = db
        .insert(adaptiveNutritionGoalRevisions)
        .values({
          id: randomUUID(),
          goalId,
          userId,
          sequence: 1,
          targetWeightKg: input.targetWeightKg,
          maintenanceCenterKg: input.maintenanceCenterKg,
          goalRatePctPerWeek: input.goalRatePctPerWeek,
          previousTargetWeightKg: input.targetWeightKg,
          previousCenterKg: input.maintenanceCenterKg,
          previousRatePctPerWeek: input.goalRatePctPerWeek,
          reason: 'created',
          effectiveLocalDate: localDate,
          createdAt: timestamp,
        })
        .returning(adaptiveGoalRevisionSelection)
        .get();
      const programRow = db
        .update(adaptiveNutritionPrograms)
        .set({
          goalType: input.type,
          targetWeightKg: input.targetWeightKg,
          goalRatePctPerWeek: input.goalRatePctPerWeek,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(adaptiveNutritionPrograms.id, program.id),
            eq(adaptiveNutritionPrograms.userId, userId),
          ),
        )
        .returning(programSelection)
        .get();
      if (!goalRow || !revisionRow || !programRow) {
        throw new Error('Failed to start adaptive goal');
      }
      const updatedProgram = parseProgram(programRow);
      appendProgramRevision(userId, updatedProgram, timestamp, 'goal_updated');
      const context = {
        goal: adaptiveGoalSchema.parse(goalRow),
        revision: adaptiveGoalRevisionSchema.parse(revisionRow),
      };
      persistGoalChangeRecommendation(userId, updatedProgram, context, localDate, timestamp);
      return getCurrentGoal(userId);
    });
  };

  const cancelGoal = (
    userId: string,
    goalId: string,
    rawInput: AdaptiveGoalLifecycleInput,
  ): AdaptiveGoal => {
    const input = adaptiveGoalLifecycleInputSchema.parse(rawInput);
    return immediate(() => {
      const timestamp = now().getTime();
      const program = findProgram(userId);
      if (!program) throw new AdaptiveProgramNotFoundError();
      const current = requireActiveGoal(userId, program.id);
      if (current.goal.id !== goalId) throw new AdaptiveGoalNotFoundError();
      if (input.expectedRevisionId && input.expectedRevisionId !== current.revision.id) {
        throw new AdaptiveGoalRevisionConflictError();
      }
      const localDate = getDateKeyInTimeZone(new Date(timestamp), program.timeZone);
      const finalTrendWeightKg = requireFreshTrendWeight(userId, program, current, localDate);
      const pending = findPending(userId, program.id);
      if (pending) {
        db.update(adaptiveNutritionCheckIns)
          .set({ status: 'superseded', resolvedAt: timestamp })
          .where(
            and(
              eq(adaptiveNutritionCheckIns.id, pending.id),
              eq(adaptiveNutritionCheckIns.userId, userId),
              eq(adaptiveNutritionCheckIns.status, 'pending'),
            ),
          )
          .run();
      }
      const row = db
        .update(adaptiveNutritionGoals)
        .set({
          status: 'cancelled',
          finalTrendWeightKg,
          endedLocalDate: localDate,
          endedReason: 'cancelled',
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(adaptiveNutritionGoals.id, goalId),
            eq(adaptiveNutritionGoals.userId, userId),
            eq(adaptiveNutritionGoals.status, 'active'),
          ),
        )
        .returning(adaptiveGoalSelection)
        .get();
      if (!row) throw new AdaptiveGoalNotFoundError();
      return adaptiveGoalSchema.parse(row);
    });
  };

  const completeGoal = (
    userId: string,
    goalId: string,
    rawInput: AdaptiveGoalCompleteInput,
  ): AdaptiveCurrentGoal => {
    const input = adaptiveGoalCompleteInputSchema.parse(rawInput);
    return immediate(() => {
      const timestamp = now().getTime();
      const program = findProgram(userId);
      if (!program) throw new AdaptiveProgramNotFoundError();
      const requestedGoalRow = db
        .select(adaptiveGoalSelection)
        .from(adaptiveNutritionGoals)
        .where(
          and(eq(adaptiveNutritionGoals.id, goalId), eq(adaptiveNutritionGoals.userId, userId)),
        )
        .limit(1)
        .get();
      if (!requestedGoalRow) throw new AdaptiveGoalNotFoundError();
      const requestedGoal = adaptiveGoalSchema.parse(requestedGoalRow);
      if (requestedGoal.status === 'completed') {
        const completion = db
          .select({
            checkInId: adaptiveNutritionGoalCompletions.checkInId,
            maintenanceGoalId: adaptiveNutritionGoalCompletions.maintenanceGoalId,
          })
          .from(adaptiveNutritionGoalCompletions)
          .where(
            and(
              eq(adaptiveNutritionGoalCompletions.userId, userId),
              eq(adaptiveNutritionGoalCompletions.completedGoalId, requestedGoal.id),
            ),
          )
          .limit(1)
          .get();
        if (!completion || completion.checkInId !== input.checkInId) {
          throw new AdaptiveGoalCompletionError();
        }
        const active = findActiveGoal(userId, program.id);
        if (active?.goal.type === 'maintain' && active.goal.id === completion.maintenanceGoalId) {
          return getCurrentGoal(userId);
        }
        throw new AdaptiveGoalCompletionError();
      }
      const current = requireActiveGoal(userId, program.id);
      if (current.goal.id !== goalId) throw new AdaptiveGoalNotFoundError();
      if (current.goal.type === 'maintain') throw new AdaptiveGoalCompletionError();
      if (input.expectedRevisionId && input.expectedRevisionId !== current.revision.id) {
        throw new AdaptiveGoalRevisionConflictError();
      }
      const checkIn = findCheckInDetail(userId, input.checkInId);
      if (
        !checkIn ||
        checkIn.status !== 'accepted' ||
        checkIn.goalId !== current.goal.id ||
        checkIn.goalRevisionId !== current.revision.id ||
        !checkIn.calculationSnapshot.goal?.goalReached
      ) {
        throw new AdaptiveGoalCompletionError();
      }
      const rebuilt = buildRecommendationBundle(userId, program, current, {
        kind: checkIn.kind,
        includeToday: checkIn.includeToday,
        localDate: checkIn.localDate,
        excludeAcceptedCheckInId: checkIn.id,
      });
      const completionFingerprint = createAdaptiveInputFingerprint({
        ...rebuilt.inputSnapshot,
        currentTarget: checkIn.inputSnapshot.currentTarget,
      });
      if (
        completionFingerprint !== checkIn.dataFingerprint ||
        !rebuilt.recommendation.goal?.goalReached
      ) {
        throw new AdaptiveCheckInStaleError();
      }
      const localDate = getDateKeyInTimeZone(new Date(timestamp), program.timeZone);
      const centerWeightKg = current.revision.targetWeightKg;
      if (centerWeightKg === null) throw new AdaptiveGoalCompletionError();
      const finalTrendWeightKg = rebuilt.recommendation.latestTrendWeightKg;
      if (finalTrendWeightKg === null) throw new AdaptiveGoalCompletionError();
      db.update(adaptiveNutritionGoals)
        .set({
          status: 'completed',
          finalTrendWeightKg,
          endedLocalDate: localDate,
          endedReason: 'completed',
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(adaptiveNutritionGoals.id, goalId),
            eq(adaptiveNutritionGoals.userId, userId),
            eq(adaptiveNutritionGoals.status, 'active'),
          ),
        )
        .run();
      const latestScale = findLatestScaleWeight(userId, localDate);
      const newGoalId = randomUUID();
      const goalRow = db
        .insert(adaptiveNutritionGoals)
        .values({
          id: newGoalId,
          userId,
          programId: program.id,
          type: 'maintain',
          status: 'active',
          startTrendWeightKg: finalTrendWeightKg,
          startScaleWeightKg: latestScale?.weightKg ?? null,
          targetWeightKg: null,
          maintenanceCenterKg: centerWeightKg,
          goalRatePctPerWeek: 0,
          startedLocalDate: localDate,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning(adaptiveGoalSelection)
        .get();
      const revisionRow = db
        .insert(adaptiveNutritionGoalRevisions)
        .values({
          id: randomUUID(),
          goalId: newGoalId,
          userId,
          sequence: 1,
          targetWeightKg: null,
          maintenanceCenterKg: centerWeightKg,
          goalRatePctPerWeek: 0,
          previousTargetWeightKg: null,
          previousCenterKg: centerWeightKg,
          previousRatePctPerWeek: 0,
          reason: 'goal_completion',
          effectiveLocalDate: localDate,
          createdAt: timestamp,
        })
        .returning(adaptiveGoalRevisionSelection)
        .get();
      const programRow = db
        .update(adaptiveNutritionPrograms)
        .set({
          goalType: 'maintain',
          targetWeightKg: null,
          goalRatePctPerWeek: 0,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(adaptiveNutritionPrograms.id, program.id),
            eq(adaptiveNutritionPrograms.userId, userId),
          ),
        )
        .returning(programSelection)
        .get();
      if (!goalRow || !revisionRow || !programRow) {
        throw new Error('Failed to create maintenance goal');
      }
      appendProgramRevision(userId, parseProgram(programRow), timestamp, 'goal_updated');
      db.insert(adaptiveNutritionGoalCompletions)
        .values({
          checkInId: checkIn.id,
          userId,
          completedGoalId: current.goal.id,
          maintenanceGoalId: newGoalId,
          createdAt: timestamp,
        })
        .run();
      return getCurrentGoal(userId);
    });
  };

  const previewCheckIn = (
    userId: string,
    rawInput: AdaptivePreviewInput,
  ): AdaptiveCheckInDetail => {
    const input = adaptivePreviewInputSchema.parse(rawInput);
    return immediate(() => {
      const timestamp = now().getTime();
      const program = findProgram(userId);
      if (!program) throw new AdaptiveProgramNotFoundError();
      const goalContext = requireActiveGoal(userId, program.id);
      const localDate = getDateKeyInTimeZone(new Date(timestamp), program.timeZone);
      const bundle = buildRecommendationBundle(userId, program, goalContext, {
        ...input,
        localDate,
      });
      const existingPending = db
        .select(checkInDetailSelection)
        .from(adaptiveNutritionCheckIns)
        .where(
          and(
            eq(adaptiveNutritionCheckIns.userId, userId),
            eq(adaptiveNutritionCheckIns.programId, program.id),
            eq(adaptiveNutritionCheckIns.status, 'pending'),
            eq(adaptiveNutritionCheckIns.dataFingerprint, bundle.recommendation.inputFingerprint),
            eq(adaptiveNutritionCheckIns.algorithmVersion, bundle.recommendation.algorithmVersion),
          ),
        )
        .limit(1)
        .get();
      if (existingPending) return parseCheckInDetail(existingPending);

      db.update(adaptiveNutritionCheckIns)
        .set({ status: 'superseded', resolvedAt: timestamp })
        .where(
          and(
            eq(adaptiveNutritionCheckIns.userId, userId),
            eq(adaptiveNutritionCheckIns.programId, program.id),
            eq(adaptiveNutritionCheckIns.status, 'pending'),
          ),
        )
        .run();

      const actionable = bundle.recommendation.state === 'updating';
      if (!actionable) {
        const reusableHeld = db
          .select(checkInDetailSelection)
          .from(adaptiveNutritionCheckIns)
          .where(
            and(
              eq(adaptiveNutritionCheckIns.userId, userId),
              eq(adaptiveNutritionCheckIns.programId, program.id),
              eq(adaptiveNutritionCheckIns.status, 'held'),
              eq(adaptiveNutritionCheckIns.kind, input.kind),
              eq(adaptiveNutritionCheckIns.localDate, localDate),
              eq(adaptiveNutritionCheckIns.dataFingerprint, bundle.recommendation.inputFingerprint),
              eq(
                adaptiveNutritionCheckIns.algorithmVersion,
                bundle.recommendation.algorithmVersion,
              ),
            ),
          )
          .limit(1)
          .get();
        if (reusableHeld) return parseCheckInDetail(reusableHeld);
      }
      return insertCheckIn(userId, program.id, goalContext, bundle, localDate, timestamp);
    });
  };

  const rebuildForAcceptance = (
    userId: string,
    program: AdaptiveProgram,
    checkIn: AdaptiveCheckInDetail,
  ): RecommendationBundle => {
    const goalContext = requireActiveGoal(userId, program.id);
    if (
      checkIn.goalId !== goalContext.goal.id ||
      checkIn.goalRevisionId !== goalContext.revision.id
    ) {
      throw new AdaptiveCheckInStaleError();
    }
    if (checkIn.kind === 'baseline') {
      const snapshot = adaptiveCheckInInputSnapshotSchema.parse(checkIn.inputSnapshot);
      const sourceWeight = snapshot.weightEntries[0];
      if (!sourceWeight) throw new AdaptiveCheckInStaleError();
      const currentWeight = db
        .select({
          id: bodyWeight.id,
          date: bodyWeight.date,
          weightKg: bodyWeight.weightKg,
          updatedAt: bodyWeight.updatedAt,
        })
        .from(bodyWeight)
        .where(and(eq(bodyWeight.id, sourceWeight.id), eq(bodyWeight.userId, userId)))
        .limit(1)
        .get();
      if (!currentWeight) throw new AdaptiveCheckInStaleError();
      return buildBaselineBundle(userId, program, goalContext, currentWeight, checkIn.localDate);
    }
    if (checkIn.kind === 'goal_change') {
      return buildGoalChangeBundle(userId, program, goalContext, checkIn.localDate);
    }
    return buildRecommendationBundle(userId, program, goalContext, {
      kind: checkIn.kind,
      includeToday: checkIn.includeToday,
      localDate: checkIn.localDate,
    });
  };

  const acceptCheckIn = (
    userId: string,
    checkInId: string,
    rawInput: AdaptiveAcceptInput,
    acceptedProposalOverride?: AdaptiveReviewTargetProposal,
  ): AdaptiveAcceptResult => {
    const input = adaptiveAcceptInputSchema.parse(rawInput);
    return immediate(() => {
      const timestamp = now().getTime();
      const checkIn = findCheckInDetail(userId, checkInId);
      if (!checkIn) throw new AdaptiveCheckInNotFoundError();
      if (checkIn.status === 'accepted') {
        const target = checkIn.acceptedNutritionTargetId
          ? findAcceptedTargetSnapshot(userId, checkIn.id, checkIn.acceptedNutritionTargetId)
          : null;
        if (!target) throw new AdaptiveCheckInNotAcceptableError();
        return { checkIn, target };
      }
      if (checkIn.status !== 'pending') throw new AdaptiveCheckInNotAcceptableError();
      const program = findProgram(userId);
      if (!program) throw new AdaptiveCheckInNotFoundError();
      if (program.algorithmVersion !== checkIn.algorithmVersion) {
        throw new AdaptiveAlgorithmVersionMismatchError();
      }
      const rebuilt = rebuildForAcceptance(userId, program, checkIn);
      if (rebuilt.recommendation.inputFingerprint !== checkIn.dataFingerprint) {
        throw new AdaptiveCheckInStaleError();
      }
      const proposal = acceptedProposalOverride ?? checkIn.proposedTargets;
      if (!proposal) throw new AdaptiveCheckInNotAcceptableError();
      if (
        acceptedProposalOverride &&
        acceptedProposalOverride.effectiveDate !== checkIn.proposedTargets?.effectiveDate
      ) {
        throw new AdaptiveCheckInNotAcceptableError();
      }
      const existing = findTargetForDate(userId, proposal.effectiveDate);
      if (existing && !input.replaceSameDateTarget) {
        throw new AdaptiveSameDateTargetExistsError();
      }
      if (existing && !targetsMatch(existing, checkIn.currentTargets)) {
        throw new AdaptiveCheckInStaleError();
      }
      const macroCalories = proposal.protein * 4 + proposal.carbs * 4 + proposal.fat * 9;
      const target = existing
        ? db
            .update(nutritionTargets)
            .set({
              ...proposal,
              source: 'adaptive',
              adaptiveCheckInId: checkIn.id,
              macroCalories,
              updatedAt: timestamp,
            })
            .where(and(eq(nutritionTargets.id, existing.id), eq(nutritionTargets.userId, userId)))
            .returning(targetSelection)
            .get()
        : db
            .insert(nutritionTargets)
            .values({
              id: randomUUID(),
              userId,
              ...proposal,
              source: 'adaptive',
              adaptiveCheckInId: checkIn.id,
              macroCalories,
              createdAt: timestamp,
              updatedAt: timestamp,
            })
            .returning(targetSelection)
            .get();
      if (!target) throw new Error('Failed to persist accepted adaptive target');

      const nextTargetEventSequence =
        (db
          .select({ value: max(nutritionTargetEvents.sequence) })
          .from(nutritionTargetEvents)
          .where(eq(nutritionTargetEvents.targetId, target.id))
          .get()?.value ?? 0) + 1;
      db.insert(nutritionTargetEvents)
        .values({
          id: randomUUID(),
          targetId: target.id,
          userId,
          sequence: nextTargetEventSequence,
          effectiveDate: proposal.effectiveDate,
          calories: proposal.calories,
          protein: proposal.protein,
          carbs: proposal.carbs,
          fat: proposal.fat,
          macroCalories,
          source: 'adaptive',
          adaptiveCheckInId: checkIn.id,
          eventType: 'adaptive_accept',
          recordedAt: timestamp,
          createdAt: timestamp,
        })
        .run();

      db.update(adaptiveNutritionCheckIns)
        .set({
          status: 'accepted',
          acceptedNutritionTargetId: target.id,
          resolvedAt: timestamp,
        })
        .where(
          and(
            eq(adaptiveNutritionCheckIns.id, checkIn.id),
            eq(adaptiveNutritionCheckIns.userId, userId),
            eq(adaptiveNutritionCheckIns.status, 'pending'),
          ),
        )
        .run();
      const accepted = findCheckInDetail(userId, checkIn.id);
      if (!accepted) throw new Error('Failed to reload accepted adaptive check-in');
      const acceptedTarget = findAcceptedTargetSnapshot(userId, checkIn.id, target.id);
      if (!acceptedTarget) throw new Error('Failed to reload immutable accepted target');
      return { checkIn: accepted, target: acceptedTarget };
    });
  };

  const declineCheckIn = (userId: string, checkInId: string): AdaptiveCheckInDetail =>
    immediate(() => {
      const checkIn = findCheckInDetail(userId, checkInId);
      if (!checkIn) throw new AdaptiveCheckInNotFoundError();
      if (checkIn.status === 'declined') return checkIn;
      if (checkIn.status !== 'pending') throw new AdaptiveCheckInNotDeclinableError();
      db.update(adaptiveNutritionCheckIns)
        .set({ status: 'declined', resolvedAt: now().getTime() })
        .where(
          and(
            eq(adaptiveNutritionCheckIns.id, checkIn.id),
            eq(adaptiveNutritionCheckIns.userId, userId),
            eq(adaptiveNutritionCheckIns.status, 'pending'),
          ),
        )
        .run();
      const declined = findCheckInDetail(userId, checkIn.id);
      if (!declined) throw new Error('Failed to reload declined adaptive check-in');
      return declined;
    });

  const listCheckIns = (
    userId: string,
    rawQuery: { page?: number; limit?: number },
  ): { data: AdaptiveCheckInSummary[]; meta: { page: number; limit: number; total: number } } => {
    const query = adaptiveCheckInQuerySchema.parse(rawQuery);
    const rows = db
      .select(checkInSummarySelection)
      .from(adaptiveNutritionCheckIns)
      .where(eq(adaptiveNutritionCheckIns.userId, userId))
      .orderBy(desc(adaptiveNutritionCheckIns.createdAt), desc(adaptiveNutritionCheckIns.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .all()
      .map(parseCheckInSummary);
    const total =
      db
        .select({ total: count() })
        .from(adaptiveNutritionCheckIns)
        .where(eq(adaptiveNutritionCheckIns.userId, userId))
        .get()?.total ?? 0;
    return { data: rows, meta: { ...query, total } };
  };

  const getState = (userId: string): AdaptiveNutritionState => {
    const program = findProgram(userId);
    const fallbackTimeZone = resolveUserPreferenceTimeZone(
      db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .get()?.preferences,
    );
    if (!program) {
      return {
        state: 'setup_required',
        timeZone: fallbackTimeZone,
        program: null,
        currentTarget: null,
        latestAcceptedCheckIn: null,
        pendingCheckIn: null,
        checkInDue: false,
        nextCheckInDate: null,
        eligibility: null,
        activeGoal: null,
        goalProgress: null,
        pendingGoalChange: null,
        goalActionRequired: null,
      };
    }
    const localDate = getDateKeyInTimeZone(now(), program.timeZone);
    const pendingCheckIn = findPending(userId, program.id);
    const latestAcceptedCheckIn = findLatestAccepted(userId, program.id);
    const currentTarget = findCurrentTarget(userId, localDate);
    const boundaries = calculateAdaptiveDateBoundaries(localDate, false);
    const nutritionDays = loadNutritionDays(userId, boundaries.analysisStart, localDate);
    const weightEntries = loadWeightEntries(userId, boundaries.warmupStart, localDate);
    const eligibilityResult = evaluateEligibility({
      boundaries,
      nutritionDays,
      weightEntries,
    });
    const readinessEvidence = summarizeAdaptiveReadinessEvidence({
      boundaries,
      nutritionDays,
      weightEntries,
      eligibility: eligibilityResult,
    });
    const lastWeekly = db
      .select({ localDate: adaptiveNutritionCheckIns.localDate })
      .from(adaptiveNutritionCheckIns)
      .where(
        and(
          eq(adaptiveNutritionCheckIns.userId, userId),
          eq(adaptiveNutritionCheckIns.programId, program.id),
          eq(adaptiveNutritionCheckIns.kind, 'weekly'),
        ),
      )
      .orderBy(desc(adaptiveNutritionCheckIns.localDate), desc(adaptiveNutritionCheckIns.createdAt))
      .limit(1)
      .get();
    const scheduleAnchor =
      lastWeekly?.localDate ?? getDateKeyInTimeZone(new Date(program.createdAt), program.timeZone);
    const nextCheckInDate = addCalendarDays(scheduleAnchor, 7);
    let state: AdaptiveNutritionState['state'];
    if (pendingCheckIn) state = 'pending_recommendation';
    else if (!latestAcceptedCheckIn) state = 'baseline';
    else if (program.status === 'paused') state = 'holding';
    else if (latestAcceptedCheckIn.kind === 'baseline' && !eligibilityResult.eligible)
      state = 'learning';
    else if (!eligibilityResult.eligible) state = 'holding';
    else state = 'updating';
    const activeGoalContext = findActiveGoal(userId, program.id);
    const currentGoal = activeGoalContext ? getCurrentGoal(userId) : null;
    return {
      state,
      timeZone: program.timeZone,
      program,
      currentTarget,
      latestAcceptedCheckIn,
      pendingCheckIn,
      checkInDue: localDate >= nextCheckInDate,
      nextCheckInDate,
      eligibility: {
        eligible: eligibilityResult.eligible,
        ...readinessEvidence,
        requiredCompleteNutritionDays: ADAPTIVE_TDEE_CONSTANTS.minimumCompleteNutritionDays,
        requiredWeighIns: ADAPTIVE_TDEE_CONSTANTS.minimumActualWeights,
        weightSpanDays: eligibilityResult.actualWeightSpanDays,
        requiredWeightSpanDays: ADAPTIVE_TDEE_CONSTANTS.minimumWeightSpanDays,
        latestUsableWeightAgeDays: eligibilityResult.latestWeightAgeDays,
        analysisEndDate: boundaries.analysisEnd,
        pendingCutoffDate: localDate,
        timeZone: program.timeZone,
        reasonCodes: eligibilityResult.holdReasons,
      },
      activeGoal: currentGoal?.goal ?? null,
      goalProgress: currentGoal?.progress ?? null,
      pendingGoalChange: currentGoal?.pendingGoalChange ?? null,
      goalActionRequired:
        currentGoal === null
          ? 'select_goal'
          : currentGoal.allowedActions.complete
            ? 'complete_goal'
            : null,
    };
  };

  return {
    acceptCheckIn,
    cancelGoal,
    completeGoal,
    declineCheckIn,
    editGoal,
    findCheckInDetail,
    getCurrentGoal,
    getState,
    listCheckIns,
    previewCheckIn,
    startGoal,
    upsertProgram,
  };
};

const getDefaultStore = async () => {
  const { db, sqlite } = await import('../../db/index.js');
  return createAdaptiveNutritionStore({ db, sqlite });
};

export const getAdaptiveNutritionState = async (userId: string) =>
  (await getDefaultStore()).getState(userId);

export const getCurrentAdaptiveGoalWithProgress = async (userId: string) =>
  (await getDefaultStore()).getCurrentGoal(userId);

export const editAdaptiveGoal = async (
  userId: string,
  goalId: string,
  input: AdaptiveGoalEditInput,
) => (await getDefaultStore()).editGoal(userId, goalId, input);

export const startAdaptiveGoal = async (userId: string, input: AdaptiveGoalStartInput) =>
  (await getDefaultStore()).startGoal(userId, input);

export const cancelAdaptiveGoal = async (
  userId: string,
  goalId: string,
  input: AdaptiveGoalLifecycleInput,
) => (await getDefaultStore()).cancelGoal(userId, goalId, input);

export const completeAdaptiveGoal = async (
  userId: string,
  goalId: string,
  input: AdaptiveGoalCompleteInput,
) => (await getDefaultStore()).completeGoal(userId, goalId, input);

export const putAdaptiveNutritionProgram = async (userId: string, input: AdaptiveProgramMutation) =>
  (await getDefaultStore()).upsertProgram(userId, input);

export const previewAdaptiveNutritionCheckIn = async (
  userId: string,
  input: AdaptivePreviewInput,
) => (await getDefaultStore()).previewCheckIn(userId, input);

export const acceptAdaptiveNutritionCheckIn = async (
  userId: string,
  checkInId: string,
  input: AdaptiveAcceptInput,
) => (await getDefaultStore()).acceptCheckIn(userId, checkInId, input);

export const declineAdaptiveNutritionCheckIn = async (userId: string, checkInId: string) =>
  (await getDefaultStore()).declineCheckIn(userId, checkInId);

export const listAdaptiveNutritionCheckIns = async (
  userId: string,
  query: { page?: number; limit?: number },
) => (await getDefaultStore()).listCheckIns(userId, query);

export const getAdaptiveNutritionCheckIn = async (userId: string, checkInId: string) => {
  const checkIn = (await getDefaultStore()).findCheckInDetail(userId, checkInId);
  if (!checkIn) throw new AdaptiveCheckInNotFoundError();
  return checkIn;
};
