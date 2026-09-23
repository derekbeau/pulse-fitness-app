import { z } from 'zod';

import { calendarReadItemSchema, calendarReadModelSchema } from './activity-journal-contracts.js';
import { dailyCheckInSourceReferenceSchema } from './daily-check-in-runtime.js';
import { dateSchema } from './common.js';

const id = z.string().trim().min(1).max(255);
const macros = z
  .object({
    calories: z.number().finite().nonnegative(),
    protein: z.number().finite().nonnegative(),
    carbs: z.number().finite().nonnegative(),
    fat: z.number().finite().nonnegative(),
  })
  .strict();

export const calendarRuntimeItemSchema = calendarReadItemSchema
  .innerType()
  .extend({
    lifecycleStatus: z
      .enum(['planned', 'completed', 'scheduled', 'in-progress', 'paused', 'partial'])
      .optional(),
    plannedLocalDate: dateSchema.nullable().optional(),
    actualLocalDate: dateSchema.nullable().optional(),
    scheduledWorkoutId: id.nullable().optional(),
    workoutSessionId: id.nullable().optional(),
    activityId: id.nullable().optional(),
    assignmentId: id.nullable().optional(),
    linkedActivityExecutionIds: z.array(id).optional(),
    sourceReference: dailyCheckInSourceReferenceSchema.optional(),
    missingProvenance: z.boolean().optional(),
    nutrition: z
      .object({
        status: z.enum(['unknown', 'partial', 'complete']).nullable(),
        actual: macros.nullable(),
        target: macros.nullable(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    const foundation = calendarReadItemSchema.safeParse({
      id: item.id,
      subjectUserId: item.subjectUserId,
      domain: item.domain,
      record: item.record,
      localDate: item.localDate,
      timeZone: item.timeZone,
      occurrenceAt: item.occurrenceAt,
      state: item.state,
      title: item.title,
    });
    if (!foundation.success)
      ctx.addIssue({ code: 'custom', message: 'Invalid foundation calendar item' });
    if ((item.domain === 'nutrition') !== (item.nutrition !== undefined))
      ctx.addIssue({ code: 'custom', message: 'Nutrition overlay must match nutrition domain' });
    if (item.id !== item.record.id)
      ctx.addIssue({ code: 'custom', message: 'Item id must be the record id' });
    if (item.missingProvenance && item.sourceReference)
      ctx.addIssue({ code: 'custom', message: 'Legacy records cannot have a source token' });
    if (
      item.sourceReference &&
      (item.sourceReference.kind !== item.record.kind ||
        item.sourceReference.id !== item.record.id ||
        item.sourceReference.subjectUserId !== item.subjectUserId)
    )
      ctx.addIssue({ code: 'custom', message: 'Source reference must match the owned record' });
  });

export const calendarRuntimeSchema = calendarReadModelSchema
  .innerType()
  .extend({
    filters: z
      .object({
        domain: z.array(z.enum(['activity', 'workout', 'journal', 'body_context', 'nutrition'])),
        state: z.array(z.enum(['planned', 'completed', 'observed', 'summary'])),
      })
      .strict(),
    items: z.array(calendarRuntimeItemSchema).max(10_000),
  })
  .strict()
  .superRefine((value, ctx) => {
    const foundation = calendarReadModelSchema.safeParse(calendarFoundationProjection(value));
    if (!foundation.success)
      ctx.addIssue({ code: 'custom', message: 'Invalid foundation calendar model' });
  });

export type CalendarRuntimeItem = z.infer<typeof calendarRuntimeItemSchema>;
export type CalendarRuntime = z.infer<typeof calendarRuntimeSchema>;
export const calendarFoundationProjection = (value: CalendarRuntime) => ({
  contractVersion: value.contractVersion,
  subjectUserId: value.subjectUserId,
  from: value.from,
  to: value.to,
  timeZone: value.timeZone,
  items: value.items.map((item) => ({
    id: item.id,
    subjectUserId: item.subjectUserId,
    domain: item.domain,
    record: item.record,
    localDate: item.localDate,
    timeZone: item.timeZone,
    occurrenceAt: item.occurrenceAt,
    state: item.state,
    title: item.title,
  })),
});
