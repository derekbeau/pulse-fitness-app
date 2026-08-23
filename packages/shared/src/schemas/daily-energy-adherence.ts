import { z } from 'zod';

import { dateSchema } from './common.js';
import { nutritionLogStatusSchema } from './nutrition.js';

const fingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const calorieSchema = z.number().int().nonnegative();
const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
      return true;
    } catch {
      return false;
    }
  }, 'Expected a valid IANA time zone');

export const dailyEnergyDataStateSchema = z.enum([
  'gradeable',
  'in_progress',
  'pending_cutoff',
  'partial',
  'unknown',
  'missing',
  'future',
  'unavailable',
]);

export const dailyEnergyAdherenceStateSchema = z.enum(['on_target', 'near_target', 'off_target']);

export const dailyEnergyReasonCodeSchema = z.enum([
  'CURRENT_DAY_IN_PROGRESS',
  'COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF',
  'PARTIAL_NUTRITION_NOT_GRADED',
  'UNKNOWN_NUTRITION_NOT_GRADED',
  'MISSING_NUTRITION_NOT_GRADED',
  'FUTURE_DATE_NOT_GRADED',
  'NO_ACCEPTED_TARGET',
  'NO_ACCEPTED_EXPENDITURE',
]);

export const dailyEnergyNutritionSchema = z
  .object({
    logId: z.string().min(1).nullable(),
    status: nutritionLogStatusSchema.nullable(),
    intakeKcal: calorieSchema.nullable(),
    mealCount: z.number().int().nonnegative(),
    itemCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((nutrition, context) => {
    if ((nutrition.logId === null) !== (nutrition.status === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Nutrition log and status availability must agree',
        path: ['status'],
      });
    }
    if ((nutrition.logId === null) !== (nutrition.intakeKcal === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Nutrition log and intake availability must agree',
        path: ['intakeKcal'],
      });
    }
    if (nutrition.logId === null && (nutrition.mealCount !== 0 || nutrition.itemCount !== 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Missing nutrition cannot report meal or item evidence',
        path: ['mealCount'],
      });
    }
  });

export const dailyEnergyTargetSchema = z
  .object({
    targetEventId: z.string().min(1),
    targetId: z.string().min(1),
    effectiveDate: dateSchema,
    recordedAt: z.number().int().positive(),
    caloriesKcal: z.number().int().positive(),
    source: z.enum(['manual', 'adaptive']),
    adaptiveCheckInId: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((target, context) => {
    if ((target.source === 'adaptive') !== (target.adaptiveCheckInId !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Adaptive targets require accepted check-in provenance',
        path: ['adaptiveCheckInId'],
      });
    }
  });

export const dailyEnergyExpenditureSchema = z
  .object({
    caloriesKcal: z.number().int().positive(),
    effectiveDate: dateSchema,
    source: z.enum(['program_baseline', 'accepted_check_in']),
    checkInId: z.string().min(1).nullable(),
    inputFingerprint: fingerprintSchema.nullable(),
  })
  .strict()
  .superRefine((expenditure, context) => {
    const isAccepted = expenditure.source === 'accepted_check_in';
    if (isAccepted !== (expenditure.checkInId !== null && expenditure.inputFingerprint !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Accepted expenditure requires check-in provenance',
        path: ['checkInId'],
      });
    }
  });

export const dailyEnergyAdherenceSchema = z
  .object({
    localDate: dateSchema,
    timeZone: timeZoneSchema,
    todayLocalDate: dateSchema,
    completedDayCutoff: dateSchema,
    isHistorical: z.boolean(),
    dataState: dailyEnergyDataStateSchema,
    nutrition: dailyEnergyNutritionSchema,
    target: dailyEnergyTargetSchema.nullable(),
    expenditure: dailyEnergyExpenditureSchema.nullable(),
    intakeMinusTargetKcal: z.number().int().nullable(),
    intakeMinusExpenditureKcal: z.number().int().nullable(),
    innerToleranceKcal: z.number().int().positive().nullable(),
    outerToleranceKcal: z.number().int().positive().nullable(),
    adherence: dailyEnergyAdherenceStateSchema.nullable(),
    reasonCodes: z.array(dailyEnergyReasonCodeSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const intake = value.nutrition.intakeKcal;
    const target = value.target?.caloriesKcal ?? null;
    const expenditure = value.expenditure?.caloriesKcal ?? null;
    const expectedTargetDifference = intake !== null && target !== null ? intake - target : null;
    const expectedExpenditureDifference =
      intake !== null && expenditure !== null ? intake - expenditure : null;

    if (value.intakeMinusTargetKcal !== expectedTargetDifference) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Target difference must equal intake minus accepted target',
        path: ['intakeMinusTargetKcal'],
      });
    }
    if (value.intakeMinusExpenditureKcal !== expectedExpenditureDifference) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Expenditure difference must equal intake minus accepted expenditure',
        path: ['intakeMinusExpenditureKcal'],
      });
    }
    if (
      (target === null) !==
      (value.innerToleranceKcal === null && value.outerToleranceKcal === null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tolerance bands require an accepted target',
        path: ['innerToleranceKcal'],
      });
    }
    if (
      target !== null &&
      (value.innerToleranceKcal !== Math.round(Math.min(150, Math.max(100, target * 0.05))) ||
        value.outerToleranceKcal !== Math.round(Math.min(400, Math.max(250, target * 0.1))))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tolerance bands must follow the accepted-target clamp contract',
        path: ['innerToleranceKcal'],
      });
    }
    if (
      value.innerToleranceKcal !== null &&
      value.outerToleranceKcal !== null &&
      value.innerToleranceKcal >= value.outerToleranceKcal
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Outer tolerance must be wider than inner tolerance',
        path: ['outerToleranceKcal'],
      });
    }
    if (value.dataState === 'gradeable') {
      if (
        value.nutrition.status !== 'complete' ||
        intake === null ||
        target === null ||
        value.adherence === null
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Gradeable days require complete nutrition, intake, target, and adherence',
          path: ['dataState'],
        });
      }
    } else if (value.adherence !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Incomplete or unavailable days cannot be graded',
        path: ['adherence'],
      });
    }

    const expectedDataState =
      value.localDate > value.todayLocalDate
        ? 'future'
        : value.localDate === value.todayLocalDate
          ? value.nutrition.status === 'complete'
            ? 'pending_cutoff'
            : 'in_progress'
          : value.nutrition.status === null
            ? 'missing'
            : value.nutrition.status === 'partial'
              ? 'partial'
              : value.nutrition.status === 'unknown'
                ? 'unknown'
                : value.target === null
                  ? 'unavailable'
                  : 'gradeable';
    if (value.dataState !== expectedDataState) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Data state must match the selected date and nutrition evidence',
        path: ['dataState'],
      });
    }
    if (value.isHistorical !== value.localDate < value.todayLocalDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Historical state must follow the program-local calendar date',
        path: ['isHistorical'],
      });
    }
    const reasonSet = new Set(value.reasonCodes);
    if (reasonSet.has('NO_ACCEPTED_TARGET') !== (value.target === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Missing-target reason must match target availability',
        path: ['reasonCodes'],
      });
    }
    if (reasonSet.has('NO_ACCEPTED_EXPENDITURE') !== (value.expenditure === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Missing-expenditure reason must match expenditure availability',
        path: ['reasonCodes'],
      });
    }
    const stateReason =
      expectedDataState === 'future'
        ? 'FUTURE_DATE_NOT_GRADED'
        : expectedDataState === 'in_progress'
          ? 'CURRENT_DAY_IN_PROGRESS'
          : expectedDataState === 'pending_cutoff'
            ? 'COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF'
            : expectedDataState === 'partial'
              ? 'PARTIAL_NUTRITION_NOT_GRADED'
              : expectedDataState === 'unknown'
                ? 'UNKNOWN_NUTRITION_NOT_GRADED'
                : expectedDataState === 'missing'
                  ? 'MISSING_NUTRITION_NOT_GRADED'
                  : null;
    const expectedReasons = [
      ...(stateReason ? [stateReason] : []),
      ...(value.target === null ? ['NO_ACCEPTED_TARGET'] : []),
      ...(value.expenditure === null ? ['NO_ACCEPTED_EXPENDITURE'] : []),
    ];
    if (
      value.reasonCodes.length !== expectedReasons.length ||
      value.reasonCodes.some((reason, index) => reason !== expectedReasons[index])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Reason codes must exactly describe the daily evidence state',
        path: ['reasonCodes'],
      });
    }
    if (
      value.dataState === 'gradeable' &&
      value.intakeMinusTargetKcal !== null &&
      value.innerToleranceKcal !== null &&
      value.outerToleranceKcal !== null
    ) {
      const absoluteDifference = Math.abs(value.intakeMinusTargetKcal);
      const expectedAdherence =
        absoluteDifference <= value.innerToleranceKcal
          ? 'on_target'
          : absoluteDifference <= value.outerToleranceKcal
            ? 'near_target'
            : 'off_target';
      if (value.adherence !== expectedAdherence) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Adherence must follow the symmetric target tolerance bands',
          path: ['adherence'],
        });
      }
    }
  });

export type DailyEnergyAdherence = z.infer<typeof dailyEnergyAdherenceSchema>;
export type DailyEnergyAdherenceState = z.infer<typeof dailyEnergyAdherenceStateSchema>;
export type DailyEnergyDataState = z.infer<typeof dailyEnergyDataStateSchema>;
export type DailyEnergyReasonCode = z.infer<typeof dailyEnergyReasonCodeSchema>;
