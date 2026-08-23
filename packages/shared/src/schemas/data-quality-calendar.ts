import { z } from 'zod';

import {
  adaptiveReviewActorSchema,
  adaptiveReviewContextCategorySchema,
} from './adaptive-weekly-review.js';
import { dateSchema } from './common.js';
import { nutritionLogStatusSchema, nutritionMacroTotalsSchema } from './nutrition.js';
import { weightUnitSchema } from './users.js';
import { workoutSessionStatusSchema } from './workout-sessions.js';

const idSchema = z.string().trim().min(1);
const reasonCodeSchema = z.string().trim().min(1).max(100);
const labelSchema = z.string().trim().min(1).max(255);

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

const calendarDaysBetween = (start: string, end: string) => {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
};

export const dataQualityCalendarQuerySchema = z
  .object({
    start: dateSchema,
    end: dateSchema,
    timeZone: timeZoneSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.start > value.end) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'start must be on or before end',
        path: ['end'],
      });
      return;
    }
    if (calendarDaysBetween(value.start, value.end) > 42) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Data Quality calendar ranges are limited to 42 days',
        path: ['end'],
      });
    }
  });

export const dataQualityEvidenceStateSchema = z.enum([
  'not_applicable',
  'missing',
  'logged',
  'pending_cutoff',
  'usable',
  'excluded',
]);

export const dataQualityActionSchema = z
  .object({
    kind: z.enum([
      'set_nutrition_status',
      'add_context',
      'correct_weight',
      'correct_workout',
      'view_check_in',
      'view_review',
      'refresh_review',
      'request_agent_review',
    ]),
    label: labelSchema,
    href: z.string().trim().min(1),
    method: z.enum(['navigate', 'patch', 'post']),
  })
  .strict();

export const dataQualityNutritionSchema = z
  .object({
    qualityState: z.enum(['no_records', 'unknown', 'partial', 'complete', 'suspected_partial']),
    evidenceState: dataQualityEvidenceStateSchema,
    logId: idSchema.nullable(),
    explicitStatus: nutritionLogStatusSchema.nullable(),
    totals: nutritionMacroTotalsSchema.nullable(),
    mealCount: z.number().int().nonnegative().nullable(),
    itemCount: z.number().int().nonnegative().nullable(),
    statusUpdatedAt: z.number().int().nonnegative().nullable(),
    updatedAt: z.number().int().nonnegative().nullable(),
    reasonCodes: z.array(reasonCodeSchema).max(50),
    actions: z.array(dataQualityActionSchema).max(10),
  })
  .strict()
  .superRefine((value, context) => {
    const missing = value.qualityState === 'no_records';
    const hasSource = value.logId !== null && value.explicitStatus !== null;
    if (missing === hasSource) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Nutrition source identity must match the recorded quality state',
        path: ['logId'],
      });
    }
    if (missing && value.totals !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A missing nutrition day cannot include numeric totals',
        path: ['totals'],
      });
    }
    if (value.qualityState === 'suspected_partial' && value.explicitStatus !== 'complete') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only an explicitly complete day can be flagged as suspected partial',
        path: ['qualityState'],
      });
    }
  });

export const dataQualityWeightSchema = z
  .object({
    evidenceState: dataQualityEvidenceStateSchema,
    entryId: idSchema.nullable(),
    weight: z.number().positive().finite().nullable(),
    unit: weightUnitSchema.nullable(),
    trendWeight: z.number().positive().finite().nullable(),
    corrected: z.boolean(),
    suspect: z.boolean(),
    stale: z.boolean(),
    createdAt: z.number().int().nonnegative().nullable(),
    updatedAt: z.number().int().nonnegative().nullable(),
    reasonCodes: z.array(reasonCodeSchema).max(50),
    actions: z.array(dataQualityActionSchema).max(10),
  })
  .strict()
  .superRefine((value, context) => {
    const sourceValues = [
      value.entryId,
      value.weight,
      value.unit,
      value.createdAt,
      value.updatedAt,
    ];
    const sourceCount = sourceValues.filter((item) => item !== null).length;
    if (sourceCount !== 0 && sourceCount !== sourceValues.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Weight source fields must be all present or all absent',
        path: ['entryId'],
      });
    }
    if (sourceCount === 0 && (value.corrected || value.suspect)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A missing weight cannot be corrected or suspect',
        path: ['entryId'],
      });
    }
  });

export const dataQualityWorkoutItemSchema = z
  .object({
    id: idSchema,
    kind: z.enum(['scheduled_workout', 'workout_session']),
    state: z.enum([
      'planned',
      'moved',
      'in_progress',
      'paused',
      'completed',
      'cancelled',
      'corrected',
    ]),
    name: labelSchema,
    sessionStatus: workoutSessionStatusSchema.nullable(),
    scheduledWorkoutId: idSchema.nullable(),
    sessionId: idSchema.nullable(),
    startedAt: z.number().int().nonnegative().nullable(),
    completedAt: z.number().int().nonnegative().nullable(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    reasonCodes: z.array(reasonCodeSchema).max(50),
    actions: z.array(dataQualityActionSchema).max(10),
  })
  .strict();

export const dataQualityAlgorithmEventSchema = z
  .object({
    id: idSchema,
    kind: z.enum(['check_in', 'weekly_review']),
    state: z.enum([
      'pending',
      'accepted',
      'declined',
      'deferred',
      'awaiting_clarification',
      'stale',
      'held',
      'superseded',
    ]),
    effectiveDate: dateSchema,
    createdAt: z.number().int().nonnegative(),
    reasonCodes: z.array(reasonCodeSchema).max(50),
    actions: z.array(dataQualityActionSchema).max(10),
  })
  .strict();

export const dataQualityAlgorithmSchema = z
  .object({
    state: z.enum(['no_program', 'pre_program', 'future', 'learning', 'updating', 'holding']),
    nutritionEvidenceState: dataQualityEvidenceStateSchema,
    weightEvidenceState: dataQualityEvidenceStateSchema,
    reasonCodes: z.array(reasonCodeSchema).max(100),
    events: z.array(dataQualityAlgorithmEventSchema).max(50),
  })
  .strict();

export const dataQualityContextSchema = z
  .object({
    id: idSchema,
    category: adaptiveReviewContextCategorySchema,
    note: z.string().trim().min(1).max(4000),
    resolution: z.string().trim().min(1).max(4000).nullable(),
    provenance: adaptiveReviewActorSchema,
    subjectKind: z.enum([
      'date',
      'date_range',
      'nutrition_log',
      'weigh_in',
      'scheduled_workout',
      'workout_session',
      'check_in',
      'upcoming_check_in',
    ]),
    revision: z.number().int().positive(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    actions: z.array(dataQualityActionSchema).max(10),
  })
  .strict();

export const dataQualityCalendarDaySchema = z
  .object({
    date: dateSchema,
    isToday: z.boolean(),
    nutrition: dataQualityNutritionSchema,
    weight: dataQualityWeightSchema,
    workouts: z.array(dataQualityWorkoutItemSchema).max(50),
    algorithm: dataQualityAlgorithmSchema,
    contexts: z.array(dataQualityContextSchema).max(100),
  })
  .strict();

const countSummarySchema = z
  .object({
    complete: z.number().int().nonnegative(),
    partial: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
  })
  .strict();

export const dataQualityCalendarSchema = z
  .object({
    range: z.object({ startDate: dateSchema, endDate: dateSchema }).strict(),
    timeZone: timeZoneSchema,
    days: z.array(dataQualityCalendarDaySchema).min(1).max(42),
    summary: z
      .object({
        nutrition: countSummarySchema,
        weight: z
          .object({
            logged: z.number().int().nonnegative(),
            missing: z.number().int().nonnegative(),
            pending: z.number().int().nonnegative(),
            excluded: z.number().int().nonnegative(),
            corrected: z.number().int().nonnegative(),
          })
          .strict(),
        workout: z
          .object({
            planned: z.number().int().nonnegative(),
            active: z.number().int().nonnegative(),
            completed: z.number().int().nonnegative(),
            cancelled: z.number().int().nonnegative(),
            corrected: z.number().int().nonnegative(),
          })
          .strict(),
        algorithm: z
          .object({
            learning: z.number().int().nonnegative(),
            updating: z.number().int().nonnegative(),
            holding: z.number().int().nonnegative(),
            pendingReview: z.number().int().nonnegative(),
          })
          .strict(),
        contextDays: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.range.startDate > value.range.endDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'range start must be on or before range end',
        path: ['range', 'endDate'],
      });
      return;
    }
    const expectedDays = calendarDaysBetween(value.range.startDate, value.range.endDate);
    if (value.days.length !== expectedDays) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Calendar response must contain one day for every requested date',
        path: ['days'],
      });
    }
    const seen = new Set<string>();
    for (const [index, day] of value.days.entries()) {
      if (
        day.date < value.range.startDate ||
        day.date > value.range.endDate ||
        seen.has(day.date)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Calendar day dates must be unique and inside the response range',
          path: ['days', index, 'date'],
        });
      }
      seen.add(day.date);
    }
  });

export type DataQualityCalendarQuery = z.infer<typeof dataQualityCalendarQuerySchema>;
export type DataQualityCalendar = z.infer<typeof dataQualityCalendarSchema>;
export type DataQualityCalendarDay = z.infer<typeof dataQualityCalendarDaySchema>;
export type DataQualityEvidenceState = z.infer<typeof dataQualityEvidenceStateSchema>;
