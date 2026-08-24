import type Database from 'better-sqlite3';
import { and, desc, eq, gt, isNotNull, lt, lte, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import {
  adaptiveProgramCalculationSchema,
  addCalendarDays,
  calculateDailyEnergyAdherence,
  dailyEnergyAdherenceSchema,
  type DailyEnergyAdherence,
} from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionPrograms,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargetEvents,
  users,
} from '../../db/schema/index.js';
import { getDateKeyInTimeZone } from '../adaptive-nutrition/analytics-store.js';
import { endOfLocalDateExclusive } from '../adaptive-nutrition/goal-trajectory-store.js';

type NutritionDatabase = BetterSQLite3Database<typeof schema>;

type ProgramSnapshot = ReturnType<typeof adaptiveProgramCalculationSchema.parse>;
type EffectiveProgramRevision = {
  id: string;
  sequence: number;
  effectiveAt: number;
  effectiveLocalDate: string;
  snapshot: ProgramSnapshot;
};

type RawProgramRevision = Omit<EffectiveProgramRevision, 'snapshot'> & {
  snapshot: string | unknown;
};

const parseProgramRevision = (revision: RawProgramRevision): EffectiveProgramRevision => ({
  ...revision,
  snapshot: adaptiveProgramCalculationSchema.parse(
    typeof revision.snapshot === 'string' ? JSON.parse(revision.snapshot) : revision.snapshot,
  ),
});

const registerDateKeyFunction = (sqlite: Database.Database) => {
  sqlite.function(
    'pulse_daily_energy_date_key',
    { deterministic: true },
    (effectiveAt: number, timeZone: string) =>
      getDateKeyInTimeZone(new Date(Number(effectiveAt)), String(timeZone)),
  );
};

const selectProgramRevisionsForDate = ({
  localDate,
  programId,
  sqlite,
  userId,
}: {
  localDate: string;
  programId: string;
  sqlite: Database.Database;
  userId: string;
}): { effective: EffectiveProgramRevision; initial: EffectiveProgramRevision } => {
  const rows = sqlite
    .prepare(
      `with recursive resolved(id, sequence, effectiveAt, snapshot, effectiveLocalDate) as (
         select revision.id,
                revision.sequence,
                revision.effective_at,
                revision.snapshot,
                pulse_daily_energy_date_key(
                  revision.effective_at,
                  json_extract(revision.snapshot, '$.timeZone')
                )
           from adaptive_nutrition_program_revisions revision
          where revision.user_id = @userId
            and revision.program_id = @programId
            and revision.sequence = 1
         union all
         select next.id,
                next.sequence,
                next.effective_at,
                next.snapshot,
                max(
                  resolved.effectiveLocalDate,
                  pulse_daily_energy_date_key(
                    next.effective_at,
                    json_extract(resolved.snapshot, '$.timeZone')
                  ),
                  pulse_daily_energy_date_key(
                    next.effective_at,
                    json_extract(next.snapshot, '$.timeZone')
                  )
                )
           from resolved
           join adaptive_nutrition_program_revisions next
             on next.user_id = @userId
            and next.program_id = @programId
            and next.sequence = resolved.sequence + 1
          where resolved.effectiveLocalDate <= @localDate
       ), candidates as (
         select *, row_number() over (order by sequence desc) as effectiveRank
           from resolved
          where effectiveLocalDate <= @localDate
       )
       select id, sequence, effectiveAt, snapshot, effectiveLocalDate
         from resolved
        where sequence = 1
       union
       select id, sequence, effectiveAt, snapshot, effectiveLocalDate
         from candidates
        where effectiveRank = 1
        order by sequence`,
    )
    .all({ localDate, programId, userId }) as RawProgramRevision[];
  const parsed = rows.map(parseProgramRevision);
  const initial = parsed.find((revision) => revision.sequence === 1);
  const effective = parsed.at(-1);
  if (!initial || !effective) {
    throw new Error('Adaptive nutrition program revision history is missing');
  }
  return { effective, initial };
};

const selectEndpointProgramRevisions = ({
  programId,
  sqlite,
  userId,
}: {
  programId: string;
  sqlite: Database.Database;
  userId: string;
}): { initial: EffectiveProgramRevision; latest: EffectiveProgramRevision } => {
  const select = (direction: 'asc' | 'desc') =>
    sqlite
      .prepare(
        `select id,
                sequence,
                effective_at as effectiveAt,
                snapshot,
                pulse_daily_energy_date_key(
                  effective_at,
                  json_extract(snapshot, '$.timeZone')
                ) as effectiveLocalDate
           from adaptive_nutrition_program_revisions
          where user_id = @userId and program_id = @programId
          order by sequence ${direction}
          limit 1`,
      )
      .get({ programId, userId }) as RawProgramRevision | undefined;
  const initialRow = select('asc');
  const latestRow = select('desc');
  if (!initialRow || !latestRow) {
    throw new Error('Adaptive nutrition program revision history is missing');
  }
  return { initial: parseProgramRevision(initialRow), latest: parseProgramRevision(latestRow) };
};

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
  sqlite: Database.Database;
  now?: () => Date;
}) => {
  const { db } = dependencies;
  registerDateKeyFunction(dependencies.sqlite);
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

    const endpointProgramRevisions = program
      ? selectEndpointProgramRevisions({
          programId: program.id,
          sqlite: dependencies.sqlite,
          userId,
        })
      : null;
    const latestProgramRevision = endpointProgramRevisions?.latest;
    const latestToday = latestProgramRevision
      ? getDateKeyInTimeZone(currentInstant, latestProgramRevision.snapshot.timeZone)
      : getDateKeyInTimeZone(currentInstant, fallbackTimeZone);
    const selectedProgramRevisions = latestProgramRevision
      ? localDate >= latestToday
        ? {
            effective: latestProgramRevision,
            initial: endpointProgramRevisions?.initial ?? latestProgramRevision,
          }
        : selectProgramRevisionsForDate({
            localDate,
            programId: program?.id ?? '',
            sqlite: dependencies.sqlite,
            userId,
          })
      : undefined;
    const effectiveProgramRevision = selectedProgramRevisions?.effective;
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

    const acceptedEffectiveDate = sql<string>`coalesce(json_extract(${adaptiveNutritionCheckIns.proposedTargets}, '$.effectiveDate'), ${adaptiveNutritionCheckIns.localDate})`;
    const acceptedExpenditure = program
      ? db
          .select({
            id: adaptiveNutritionCheckIns.id,
            dataFingerprint: adaptiveNutritionCheckIns.dataFingerprint,
            effectiveDate: acceptedEffectiveDate,
            proposedTdeeKcal: adaptiveNutritionCheckIns.proposedTdeeKcal,
          })
          .from(adaptiveNutritionCheckIns)
          .where(
            and(
              eq(adaptiveNutritionCheckIns.userId, userId),
              eq(adaptiveNutritionCheckIns.programId, program.id),
              eq(adaptiveNutritionCheckIns.status, 'accepted'),
              isNotNull(adaptiveNutritionCheckIns.proposedTdeeKcal),
              isNotNull(adaptiveNutritionCheckIns.resolvedAt),
              lt(adaptiveNutritionCheckIns.resolvedAt, causalCutoff),
              lte(acceptedEffectiveDate, latestAvailableFactDate),
            ),
          )
          .orderBy(
            desc(acceptedEffectiveDate),
            desc(adaptiveNutritionCheckIns.resolvedAt),
            desc(adaptiveNutritionCheckIns.createdAt),
            desc(adaptiveNutritionCheckIns.id),
          )
          .limit(1)
          .get()
      : undefined;
    const initialProgramRevision = selectedProgramRevisions?.initial;
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
                effectiveDate: acceptedExpenditure.effectiveDate,
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
  const { db, sqlite } = await import('../../db/index.js');
  return createDailyEnergyAdherenceStore({ db, sqlite });
};

export const getDailyEnergyAdherenceForDate = async (userId: string, localDate: string) =>
  (await getDefaultStore()).getDailyEnergyAdherence(userId, localDate);
