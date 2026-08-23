import { and, asc, desc, eq, gt, lt, lte, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import {
  adaptiveCheckInDetailSchema,
  adaptiveProgramCalculationSchema,
  addCalendarDays,
  calculateDailyEnergyAdherence,
  dailyEnergyAdherenceSchema,
  type DailyEnergyAdherence,
} from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionProgramRevisions,
  adaptiveNutritionPrograms,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargetEvents,
  users,
} from '../../db/schema/index.js';
import {
  getDateKeyInTimeZone,
  resolveEffectiveProgramRevisions,
} from '../adaptive-nutrition/analytics-store.js';
import { endOfLocalDateExclusive } from '../adaptive-nutrition/goal-trajectory-store.js';

type NutritionDatabase = BetterSQLite3Database<typeof schema>;

const validTimeZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
};

const preferredTimeZone = (preferences: Record<string, unknown> | null): string => {
  const candidate = preferences?.timeZone ?? preferences?.timezone;
  return validTimeZone(candidate) ? candidate : 'UTC';
};

export const createDailyEnergyAdherenceStore = (dependencies: {
  db: NutritionDatabase;
  now?: () => Date;
}) => {
  const { db } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  const getDailyEnergyAdherence = (userId: string, localDate: string): DailyEnergyAdherence => {
    const currentInstant = now();
    const user = db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .get();
    const fallbackTimeZone = preferredTimeZone(user?.preferences ?? null);
    const program = db
      .select({ id: adaptiveNutritionPrograms.id })
      .from(adaptiveNutritionPrograms)
      .where(eq(adaptiveNutritionPrograms.userId, userId))
      .limit(1)
      .get();

    const programRevisions = program
      ? resolveEffectiveProgramRevisions(
          db
            .select({
              id: adaptiveNutritionProgramRevisions.id,
              sequence: adaptiveNutritionProgramRevisions.sequence,
              effectiveAt: adaptiveNutritionProgramRevisions.effectiveAt,
              snapshot: adaptiveNutritionProgramRevisions.snapshot,
            })
            .from(adaptiveNutritionProgramRevisions)
            .where(
              and(
                eq(adaptiveNutritionProgramRevisions.userId, userId),
                eq(adaptiveNutritionProgramRevisions.programId, program.id),
              ),
            )
            .orderBy(asc(adaptiveNutritionProgramRevisions.sequence))
            .all()
            .map((revision) => ({
              ...revision,
              snapshot: adaptiveProgramCalculationSchema.parse(revision.snapshot),
            })),
        )
      : [];
    const latestProgramRevision = programRevisions.at(-1);
    const latestToday = latestProgramRevision
      ? getDateKeyInTimeZone(currentInstant, latestProgramRevision.snapshot.timeZone)
      : getDateKeyInTimeZone(currentInstant, fallbackTimeZone);
    const effectiveProgramRevision = latestProgramRevision
      ? localDate >= latestToday
        ? latestProgramRevision
        : ([...programRevisions]
            .reverse()
            .find(
              (revision) =>
                revision.effectiveLocalDate <= localDate &&
                revision.effectiveAt <
                  endOfLocalDateExclusive(localDate, revision.snapshot.timeZone),
            ) ?? programRevisions[0])
      : undefined;
    const timeZone = effectiveProgramRevision?.snapshot.timeZone ?? fallbackTimeZone;
    const todayLocalDate = getDateKeyInTimeZone(currentInstant, timeZone);
    const completedDayCutoff = addCalendarDays(todayLocalDate, -1);
    const latestAvailableFactDate = localDate > todayLocalDate ? todayLocalDate : localDate;
    const causalCutoff = Math.min(
      endOfLocalDateExclusive(localDate, timeZone),
      currentInstant.getTime() + 1,
    );

    const nutrition = db
      .select({
        logId: nutritionLogs.id,
        status: nutritionLogs.status,
        intakeKcal: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
        mealCount: sql<number>`count(distinct ${meals.id})`,
        itemCount: sql<number>`count(${mealItems.id})`,
      })
      .from(nutritionLogs)
      .leftJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
      .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
      .where(and(eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, localDate)))
      .groupBy(nutritionLogs.id)
      .limit(1)
      .get();

    const targetEvent = db
      .select({
        targetEventId: nutritionTargetEvents.id,
        targetId: nutritionTargetEvents.targetId,
        effectiveDate: nutritionTargetEvents.effectiveDate,
        recordedAt: nutritionTargetEvents.recordedAt,
        calories: nutritionTargetEvents.calories,
        source: nutritionTargetEvents.source,
        adaptiveCheckInId: nutritionTargetEvents.adaptiveCheckInId,
      })
      .from(nutritionTargetEvents)
      .where(
        and(
          eq(nutritionTargetEvents.userId, userId),
          gt(nutritionTargetEvents.calories, 0),
          lte(nutritionTargetEvents.effectiveDate, latestAvailableFactDate),
          lt(nutritionTargetEvents.recordedAt, causalCutoff),
        ),
      )
      .orderBy(
        desc(nutritionTargetEvents.effectiveDate),
        desc(nutritionTargetEvents.recordedAt),
        desc(nutritionTargetEvents.sequence),
        desc(nutritionTargetEvents.id),
      )
      .limit(1)
      .get();

    const acceptedCheckIns = program
      ? db
          .select()
          .from(adaptiveNutritionCheckIns)
          .where(
            and(
              eq(adaptiveNutritionCheckIns.userId, userId),
              eq(adaptiveNutritionCheckIns.programId, program.id),
              eq(adaptiveNutritionCheckIns.status, 'accepted'),
              lt(adaptiveNutritionCheckIns.resolvedAt, causalCutoff),
            ),
          )
          .orderBy(
            asc(adaptiveNutritionCheckIns.resolvedAt),
            asc(adaptiveNutritionCheckIns.createdAt),
            asc(adaptiveNutritionCheckIns.id),
          )
          .all()
          .map((row) => {
            const { userId: rowUserId, programId: rowProgramId, ...detail } = row;
            if (rowUserId !== userId || rowProgramId !== program.id) {
              throw new Error('Adaptive check-in query escaped the requested user and program');
            }
            return adaptiveCheckInDetailSchema.parse(detail);
          })
          .filter(
            (checkIn) =>
              checkIn.proposedTdeeKcal !== null &&
              (checkIn.proposedTargets?.effectiveDate ?? checkIn.localDate) <=
                latestAvailableFactDate,
          )
      : [];
    const acceptedExpenditure = [...acceptedCheckIns]
      .sort((left, right) => {
        const leftDate = left.proposedTargets?.effectiveDate ?? left.localDate;
        const rightDate = right.proposedTargets?.effectiveDate ?? right.localDate;
        return (
          leftDate.localeCompare(rightDate) ||
          (left.resolvedAt ?? 0) - (right.resolvedAt ?? 0) ||
          left.createdAt - right.createdAt ||
          left.id.localeCompare(right.id)
        );
      })
      .at(-1);
    const initialProgramRevision = programRevisions[0];
    const baselineAvailable =
      initialProgramRevision !== undefined &&
      initialProgramRevision.effectiveLocalDate <= localDate &&
      initialProgramRevision.effectiveAt < causalCutoff;
    const expenditureKcal =
      acceptedExpenditure?.proposedTdeeKcal ??
      (baselineAvailable ? initialProgramRevision.snapshot.baselineTdeeKcal : null);
    const calculation = calculateDailyEnergyAdherence({
      localDate,
      todayLocalDate,
      nutritionStatus: nutrition?.status ?? null,
      intakeKcal: nutrition ? nutrition.intakeKcal : null,
      targetKcal: targetEvent?.calories ?? null,
      expenditureKcal,
    });

    return dailyEnergyAdherenceSchema.parse({
      localDate,
      timeZone,
      todayLocalDate,
      completedDayCutoff,
      isHistorical: localDate < todayLocalDate,
      dataState: calculation.dataState,
      nutrition: {
        logId: nutrition?.logId ?? null,
        status: nutrition?.status ?? null,
        intakeKcal: calculation.intakeKcal,
        mealCount: nutrition?.mealCount ?? 0,
        itemCount: nutrition?.itemCount ?? 0,
      },
      target: targetEvent
        ? {
            targetEventId: targetEvent.targetEventId,
            targetId: targetEvent.targetId,
            effectiveDate: targetEvent.effectiveDate,
            recordedAt: targetEvent.recordedAt,
            caloriesKcal: calculation.targetKcal,
            source: targetEvent.source,
            adaptiveCheckInId: targetEvent.adaptiveCheckInId,
          }
        : null,
      expenditure:
        calculation.expenditureKcal === null
          ? null
          : acceptedExpenditure
            ? {
                caloriesKcal: calculation.expenditureKcal,
                effectiveDate:
                  acceptedExpenditure.proposedTargets?.effectiveDate ??
                  acceptedExpenditure.localDate,
                source: 'accepted_check_in',
                checkInId: acceptedExpenditure.id,
                inputFingerprint: acceptedExpenditure.dataFingerprint,
              }
            : {
                caloriesKcal: calculation.expenditureKcal,
                effectiveDate: initialProgramRevision?.effectiveLocalDate,
                source: 'program_baseline',
                checkInId: null,
                inputFingerprint: null,
              },
      intakeMinusTargetKcal: calculation.intakeMinusTargetKcal,
      intakeMinusExpenditureKcal: calculation.intakeMinusExpenditureKcal,
      innerToleranceKcal: calculation.innerToleranceKcal,
      outerToleranceKcal: calculation.outerToleranceKcal,
      adherence: calculation.adherence,
      reasonCodes: calculation.reasonCodes,
    });
  };

  return { getDailyEnergyAdherence };
};

const getDefaultStore = async () => {
  const { db } = await import('../../db/index.js');
  return createDailyEnergyAdherenceStore({ db });
};

export const getDailyEnergyAdherenceForDate = async (userId: string, localDate: string) =>
  (await getDefaultStore()).getDailyEnergyAdherence(userId, localDate);
