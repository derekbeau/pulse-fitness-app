import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import { and, asc, count, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import {
  ADAPTIVE_TDEE_CONSTANTS,
  adaptiveAcceptInputSchema,
  adaptiveCheckInDetailSchema,
  adaptiveCheckInInputSnapshotSchema,
  adaptiveCheckInQuerySchema,
  adaptiveCheckInSummarySchema,
  adaptiveCurrentTargetSchema,
  adaptiveProgramCalculationSchema,
  adaptiveProgramMutationSchema,
  adaptiveProgramSchema,
  adaptivePreviewInputSchema,
  adaptiveRecommendationSchema,
  addCalendarDays,
  allocateMacros,
  buildAdaptiveRecommendation,
  calculateAdaptiveDateBoundaries,
  calculateBaselineTdee,
  calculateGoalCalories,
  calculateSystemCalorieFloor,
  calendarDaysBetween,
  convertWeightFromKg,
  convertWeightToKg,
  createAdaptiveInputFingerprint,
  evaluateEligibility,
  type AdaptiveAcceptInput,
  type AdaptiveAcceptResult,
  type AdaptiveCheckInDetail,
  type AdaptiveCheckInInputSnapshot,
  type AdaptiveCheckInSummary,
  type AdaptiveNutritionDay,
  type AdaptiveNutritionState,
  type AdaptivePreviewInput,
  type AdaptiveProgram,
  type AdaptiveProgramCalculation,
  type AdaptiveProgramMutation,
  type AdaptiveRecommendation,
  type AdaptiveWeightEntry,
  type NutritionTarget,
} from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionPrograms,
  bodyWeight,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
  users,
} from '../../db/schema/index.js';

type AdaptiveDatabase = BetterSQLite3Database<typeof schema>;

export class AdaptiveProgramNotFoundError extends Error {
  constructor() {
    super('Adaptive nutrition program not found');
    this.name = 'AdaptiveProgramNotFoundError';
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

export const createAdaptiveNutritionStore = (options: {
  db: AdaptiveDatabase;
  sqlite: Database.Database;
  now?: () => Date;
}) => {
  const { db, sqlite } = options;
  const now = options.now ?? (() => new Date());

  const immediate = <T>(operation: () => T): T => sqlite.transaction(operation).immediate();

  const findProgram = (userId: string): AdaptiveProgram | null => {
    const value = db
      .select(programSelection)
      .from(adaptiveNutritionPrograms)
      .where(eq(adaptiveNutritionPrograms.userId, userId))
      .limit(1)
      .get();
    return value ? parseProgram(value) : null;
  };

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

  const findLatestAccepted = (userId: string, programId: string): AdaptiveCheckInSummary | null => {
    const value = db
      .select(checkInSummarySelection)
      .from(adaptiveNutritionCheckIns)
      .where(
        and(
          eq(adaptiveNutritionCheckIns.userId, userId),
          eq(adaptiveNutritionCheckIns.programId, programId),
          eq(adaptiveNutritionCheckIns.status, 'accepted'),
          isNotNull(adaptiveNutritionCheckIns.proposedTdeeKcal),
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
    input: AdaptivePreviewInput & { localDate: string },
  ): RecommendationBundle => {
    const calculationProgram = toCalculationProgram(program);
    const boundaries = calculateAdaptiveDateBoundaries(input.localDate, input.includeToday);
    const nutritionDays = loadNutritionDays(
      userId,
      boundaries.analysisStart,
      boundaries.analysisEnd,
    );
    const weightEntries = loadWeightEntries(userId, boundaries.warmupStart, boundaries.analysisEnd);
    const accepted = findLatestAccepted(userId, program.id);
    const priorTdee =
      accepted?.proposedTdeeKcal == null
        ? null
        : { checkInId: accepted.id, tdeeKcal: accepted.proposedTdeeKcal };
    const currentTarget = findCurrentTarget(userId, input.localDate);
    const inputSnapshot = adaptiveCheckInInputSnapshotSchema.parse({
      version: 1,
      constants: ADAPTIVE_TDEE_CONSTANTS,
      program: calculationProgram,
      priorTdee,
      currentTarget: toFingerprintTarget(currentTarget),
      boundaries,
      includeToday: input.includeToday,
      nutritionDays,
      weightEntries,
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
    if (findTargetForDate(userId, input.localDate)) {
      recommendation = {
        ...recommendation,
        reasonCodes: dedupeReasons([...recommendation.reasonCodes, 'SAME_DATE_TARGET_EXISTS']),
      };
    }
    return { recommendation, inputSnapshot, currentTarget };
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
    currentWeight: AdaptiveWeightEntry,
    localDate: string,
  ): RecommendationBundle => {
    const calculationProgram = toCalculationProgram(program);
    const boundaries = calculateAdaptiveDateBoundaries(localDate, true);
    const currentTarget = findCurrentTarget(userId, localDate);
    const inputSnapshot = adaptiveCheckInInputSnapshotSchema.parse({
      version: 1,
      constants: ADAPTIVE_TDEE_CONSTANTS,
      program: calculationProgram,
      priorTdee: null,
      currentTarget: toFingerprintTarget(currentTarget),
      boundaries,
      includeToday: true,
      nutritionDays: [],
      weightEntries: [currentWeight],
    });
    const inputFingerprint = createAdaptiveInputFingerprint(inputSnapshot);
    const goal = calculateGoalCalories({
      goalType: calculationProgram.goalType,
      goalRatePctPerWeek: calculationProgram.goalRatePctPerWeek,
      targetWeightKg: calculationProgram.targetWeightKg,
      latestTrendWeightKg: currentWeight.weightKg,
      adaptiveTdeeKcal: calculationProgram.baselineTdeeKcal,
      systemCalorieFloorKcal: calculationProgram.systemCalorieFloorKcal,
      userCalorieFloorKcal: calculationProgram.userCalorieFloorKcal,
    });
    const macros = allocateMacros({
      goalCalories: goal.goalCalories,
      proteinGrams: calculationProgram.proteinGrams,
      fatAllocationPct: calculationProgram.fatAllocationPct,
    });
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
      if (shouldRebaseline) {
        insertCheckIn(
          userId,
          program.id,
          buildBaselineBundle(userId, program, currentWeight, localDate),
          localDate,
          timestamp,
        );
      }
      return program;
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
      const localDate = getDateKeyInTimeZone(new Date(timestamp), program.timeZone);
      const bundle = buildRecommendationBundle(userId, program, { ...input, localDate });
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
      } else {
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
      }
      return insertCheckIn(userId, program.id, bundle, localDate, timestamp);
    });
  };

  const rebuildForAcceptance = (
    userId: string,
    program: AdaptiveProgram,
    checkIn: AdaptiveCheckInDetail,
  ): RecommendationBundle => {
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
      return buildBaselineBundle(userId, program, currentWeight, checkIn.localDate);
    }
    return buildRecommendationBundle(userId, program, {
      kind: checkIn.kind,
      includeToday: checkIn.includeToday,
      localDate: checkIn.localDate,
    });
  };

  const acceptCheckIn = (
    userId: string,
    checkInId: string,
    rawInput: AdaptiveAcceptInput,
  ): AdaptiveAcceptResult => {
    const input = adaptiveAcceptInputSchema.parse(rawInput);
    return immediate(() => {
      const timestamp = now().getTime();
      const checkIn = findCheckInDetail(userId, checkInId);
      if (!checkIn) throw new AdaptiveCheckInNotFoundError();
      if (checkIn.status === 'accepted') {
        const target = checkIn.acceptedNutritionTargetId
          ? db
              .select(targetSelection)
              .from(nutritionTargets)
              .where(
                and(
                  eq(nutritionTargets.id, checkIn.acceptedNutritionTargetId),
                  eq(nutritionTargets.userId, userId),
                ),
              )
              .limit(1)
              .get()
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
      const proposal = checkIn.proposedTargets;
      if (!proposal) throw new AdaptiveCheckInNotAcceptableError();
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

      if (checkIn.calculationSnapshot.goal?.goalReached) {
        db.update(adaptiveNutritionPrograms)
          .set({ goalType: 'maintain', goalRatePctPerWeek: 0, updatedAt: timestamp })
          .where(
            and(
              eq(adaptiveNutritionPrograms.id, program.id),
              eq(adaptiveNutritionPrograms.userId, userId),
            ),
          )
          .run();
      }
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
      return { checkIn: accepted, target };
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
    if (!program) {
      return {
        state: 'setup_required',
        program: null,
        currentTarget: null,
        latestAcceptedCheckIn: null,
        pendingCheckIn: null,
        checkInDue: false,
        nextCheckInDate: null,
        eligibility: null,
      };
    }
    const localDate = getDateKeyInTimeZone(now(), program.timeZone);
    const pendingCheckIn = findPending(userId, program.id);
    const latestAcceptedCheckIn = findLatestAccepted(userId, program.id);
    const currentTarget = findCurrentTarget(userId, localDate);
    const boundaries = calculateAdaptiveDateBoundaries(localDate, false);
    const eligibilityResult = evaluateEligibility({
      boundaries,
      nutritionDays: loadNutritionDays(userId, boundaries.analysisStart, boundaries.analysisEnd),
      weightEntries: loadWeightEntries(userId, boundaries.warmupStart, boundaries.analysisEnd),
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
    return {
      state,
      program,
      currentTarget,
      latestAcceptedCheckIn,
      pendingCheckIn,
      checkInDue: localDate >= nextCheckInDate,
      nextCheckInDate,
      eligibility: {
        eligible: eligibilityResult.eligible,
        completeNutritionDays: eligibilityResult.usableNutritionDays.length,
        requiredCompleteNutritionDays: ADAPTIVE_TDEE_CONSTANTS.minimumCompleteNutritionDays,
        weighIns: eligibilityResult.actualWeights.length,
        requiredWeighIns: ADAPTIVE_TDEE_CONSTANTS.minimumActualWeights,
        weightSpanDays: eligibilityResult.actualWeightSpanDays,
        requiredWeightSpanDays: ADAPTIVE_TDEE_CONSTANTS.minimumWeightSpanDays,
        latestWeightAgeDays: eligibilityResult.latestWeightAgeDays,
        reasonCodes: eligibilityResult.holdReasons,
      },
    };
  };

  return {
    acceptCheckIn,
    declineCheckIn,
    findCheckInDetail,
    getState,
    listCheckIns,
    previewCheckIn,
    upsertProgram,
  };
};

const getDefaultStore = async () => {
  const { db, sqlite } = await import('../../db/index.js');
  return createAdaptiveNutritionStore({ db, sqlite });
};

export const getAdaptiveNutritionState = async (userId: string) =>
  (await getDefaultStore()).getState(userId);

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
