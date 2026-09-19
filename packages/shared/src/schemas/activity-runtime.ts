import { z } from 'zod';

import {
  activityAssignmentSchema,
  activityExecutionSchema,
  activityGoalKindSchema,
  activityGoalSchema,
  activityJournalActorSchema,
  activityRecurrenceRevisionSchema,
  canonicalActivityKindSchema,
  canonicalActivitySchema,
  ianaTimeZoneSchema,
  immutableCorrectionRevisionSchema,
  ownedEntityLinkSchema,
  provenanceSchema,
  recurrenceFrequencySchema,
} from './activity-journal-contracts.js';
import { dateSchema } from './common.js';

const idSchema = z.string().trim().min(1).max(255);
const textSchema = z.string().trim().min(1).max(10_000);
const shortTextSchema = z.string().trim().min(1).max(255);
const instantSchema = z.string().datetime({ offset: true });

export const activityIdempotencyKeySchema = z.string().trim().min(8).max(255);

export const activityProvenanceCaptureInputSchema = provenanceSchema.omit({ capturedBy: true });

export const createActivityApiInputSchema = z
  .object({
    kind: canonicalActivityKindSchema,
    name: shortTextSchema,
    goalIds: z.array(idSchema).max(20).default([]),
    structuredWorkoutSessionId: idSchema.nullable().default(null),
    source: activityProvenanceCaptureInputSchema,
    idempotencyKey: activityIdempotencyKeySchema,
  })
  .strict();

export const correctActivityApiInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    correctedFields: z
      .object({
        kind: canonicalActivityKindSchema.optional(),
        name: shortTextSchema.optional(),
        goalIds: z.array(idSchema).max(20).optional(),
        structuredWorkoutSessionId: idSchema.nullable().optional(),
        source: activityProvenanceCaptureInputSchema.optional(),
      })
      .strict()
      .refine((fields) => Object.keys(fields).length > 0, {
        message: 'A correction must change at least one field.',
      }),
    reason: textSchema,
    idempotencyKey: activityIdempotencyKeySchema,
  })
  .strict();

export const createActivityGoalApiInputSchema = z
  .object({
    kind: activityGoalKindSchema,
    label: shortTextSchema,
    idempotencyKey: activityIdempotencyKeySchema,
  })
  .strict();

export const updateActivityGoalApiInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    label: shortTextSchema.optional(),
    state: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
    idempotencyKey: activityIdempotencyKeySchema,
  })
  .strict()
  .refine((input) => input.label !== undefined || input.state !== undefined, {
    message: 'A goal update must change label or state.',
  });

export const activityGoalRuntimeSchema = activityGoalSchema.extend({
  revision: z.number().int().positive(),
  updatedAt: instantSchema,
});

export const replaceActivityGoalLinksApiInputSchema = z
  .object({
    goalIds: z.array(idSchema).max(20),
    expectedRevision: z.number().int().positive(),
    idempotencyKey: activityIdempotencyKeySchema,
  })
  .strict();

export const createActivityAssignmentApiInputSchema = z
  .object({
    plannedLocalDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    recurrenceRevisionId: idSchema.nullable().default(null),
    idempotencyKey: activityIdempotencyKeySchema,
  })
  .strict();

export const rescheduleActivityAssignmentApiInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    plannedLocalDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    reason: textSchema,
    idempotencyKey: activityIdempotencyKeySchema,
  })
  .strict();

export const recordActivityExecutionApiInputSchema = z
  .object({
    assignmentId: idSchema.nullable().default(null),
    actualOccurredAt: instantSchema,
    actualLocalDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    durationMinutes: z.number().int().positive().nullable(),
    outcome: z.enum(['completed', 'partial', 'skipped', 'unknown']),
    structuredWorkoutSessionId: idSchema.nullable().default(null),
    source: activityProvenanceCaptureInputSchema,
    idempotencyKey: activityIdempotencyKeySchema,
  })
  .strict();

export const correctActivityExecutionApiInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    correctedFields: z
      .object({
        actualOccurredAt: instantSchema.optional(),
        actualLocalDate: dateSchema.optional(),
        timeZone: ianaTimeZoneSchema.optional(),
        durationMinutes: z.number().int().positive().nullable().optional(),
        outcome: z.enum(['completed', 'partial', 'skipped', 'unknown']).optional(),
        source: activityProvenanceCaptureInputSchema.optional(),
      })
      .strict()
      .refine((fields) => Object.keys(fields).length > 0, {
        message: 'A correction must change at least one field.',
      }),
    reason: textSchema,
    idempotencyKey: activityIdempotencyKeySchema,
  })
  .strict();

const recurrenceDefinitionSchema = z.object({
  effectiveFromLocalDate: dateSchema,
  timeZone: ianaTimeZoneSchema,
  frequency: recurrenceFrequencySchema,
  interval: z.number().int().positive().max(365),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  assignmentPolicy: z
    .literal('unassigned_on_or_after_effective_date')
    .default('unassigned_on_or_after_effective_date'),
});

export const createActivityRecurrenceApiInputSchema = recurrenceDefinitionSchema
  .extend({ idempotencyKey: activityIdempotencyKeySchema })
  .strict()
  .refine((input) => input.frequency !== 'specific_weekdays' || input.weekdays.length > 0, {
    path: ['weekdays'],
    message: 'Specific-weekday recurrence requires at least one weekday.',
  });

export const reviseActivityRecurrenceApiInputSchema = recurrenceDefinitionSchema
  .extend({
    expectedRevisionId: idSchema,
    idempotencyKey: activityIdempotencyKeySchema,
  })
  .strict()
  .refine((input) => input.frequency !== 'specific_weekdays' || input.weekdays.length > 0, {
    path: ['weekdays'],
    message: 'Specific-weekday recurrence requires at least one weekday.',
  });

export const materializeActivityRecurrenceApiInputSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    idempotencyKey: activityIdempotencyKeySchema,
  })
  .strict()
  .refine((input) => input.from <= input.to, {
    path: ['to'],
    message: 'Materialization end must not precede its start.',
  })
  .refine(
    (input) => {
      const from = Date.parse(`${input.from}T00:00:00Z`);
      const to = Date.parse(`${input.to}T00:00:00Z`);
      return Number.isFinite(from) && Number.isFinite(to) && (to - from) / 86_400_000 <= 366;
    },
    {
      path: ['to'],
      message: 'Materialization range cannot exceed 366 days.',
    },
  );

export const createActivityOwnedLinkApiInputSchema = z
  .object({
    target: z
      .object({
        kind: z.enum(['activity', 'workout_session', 'scheduled_workout']),
        id: idSchema,
        revisionId: idSchema.nullable().default(null),
      })
      .strict(),
    relation: z.enum(['structured_workout_reference', 'observed_during']),
    idempotencyKey: activityIdempotencyKeySchema,
  })
  .strict();

export const activityListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .extend({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    includeLegacy: z
      .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
      .default(true),
  })
  .strict()
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    path: ['to'],
    message: 'List end must not precede its start.',
  });

export const canonicalActivityListItemSchema = z.object({
  recordType: z.literal('canonical'),
  activity: canonicalActivitySchema,
  goals: z.array(activityGoalRuntimeSchema).max(20),
  latestPlannedLocalDate: dateSchema.nullable(),
  latestActualLocalDate: dateSchema.nullable(),
});

export const legacyActivityReadModelSchema = z.object({
  recordType: z.literal('legacy_date_only'),
  id: idSchema,
  subjectUserId: idSchema,
  localDate: dateSchema,
  kind: z.enum([
    'walking',
    'running',
    'stretching',
    'yoga',
    'cycling',
    'swimming',
    'hiking',
    'other',
  ]),
  name: shortTextSchema,
  durationMinutes: z.number().int().positive(),
  notes: z.string().nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  ambiguity: z.literal('No occurrence time, timezone, actor, or provenance was recorded.'),
});

export const activityListItemSchema = z.union([
  canonicalActivityListItemSchema,
  legacyActivityReadModelSchema,
]);

export const activityRevisionReadModelSchema = z.object({
  id: idSchema,
  activityId: idSchema,
  subjectUserId: idSchema,
  revision: z.number().int().positive(),
  priorRevisionId: idSchema.nullable(),
  changeKind: z.enum(['created', 'correction', 'goal_links']),
  correctedFields: z.record(z.string(), z.unknown()).nullable(),
  reason: z.string().nullable(),
  actor: activityJournalActorSchema,
  createdAt: instantSchema,
});

export const activityRecurrenceReadModelSchema = z.object({
  id: idSchema,
  activityId: idSchema,
  subjectUserId: idSchema,
  revisions: z.array(activityRecurrenceRevisionSchema),
});

export const canonicalActivityDetailSchema = z.object({
  recordType: z.literal('canonical'),
  activity: canonicalActivitySchema,
  goals: z.array(activityGoalRuntimeSchema).max(20),
  revisions: z.array(activityRevisionReadModelSchema),
  assignments: z.array(activityAssignmentSchema),
  assignmentHistory: z.array(activityAssignmentSchema),
  executions: z.array(activityExecutionSchema),
  executionCorrections: z.array(immutableCorrectionRevisionSchema),
  recurrences: z.array(activityRecurrenceReadModelSchema),
  sourceLinks: z.array(ownedEntityLinkSchema),
});

export const activityDetailSchema = z.union([
  canonicalActivityDetailSchema,
  legacyActivityReadModelSchema,
]);

export const activityMaterializationResultSchema = z.object({
  recurrenceId: idSchema,
  revisionId: idSchema,
  created: z.array(activityAssignmentSchema),
  existing: z.array(activityAssignmentSchema),
});

export type CreateActivityApiInput = z.infer<typeof createActivityApiInputSchema>;
export type CorrectActivityApiInput = z.infer<typeof correctActivityApiInputSchema>;
export type CreateActivityGoalApiInput = z.infer<typeof createActivityGoalApiInputSchema>;
export type UpdateActivityGoalApiInput = z.infer<typeof updateActivityGoalApiInputSchema>;
export type ReplaceActivityGoalLinksApiInput = z.infer<
  typeof replaceActivityGoalLinksApiInputSchema
>;
export type CreateActivityAssignmentApiInput = z.infer<
  typeof createActivityAssignmentApiInputSchema
>;
export type RescheduleActivityAssignmentApiInput = z.infer<
  typeof rescheduleActivityAssignmentApiInputSchema
>;
export type RecordActivityExecutionApiInput = z.infer<typeof recordActivityExecutionApiInputSchema>;
export type CorrectActivityExecutionApiInput = z.infer<
  typeof correctActivityExecutionApiInputSchema
>;
export type CreateActivityRecurrenceApiInput = z.infer<
  typeof createActivityRecurrenceApiInputSchema
>;
export type ReviseActivityRecurrenceApiInput = z.infer<
  typeof reviseActivityRecurrenceApiInputSchema
>;
export type MaterializeActivityRecurrenceApiInput = z.infer<
  typeof materializeActivityRecurrenceApiInputSchema
>;
export type CreateActivityOwnedLinkApiInput = z.infer<typeof createActivityOwnedLinkApiInputSchema>;
export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
export type ActivityGoalRuntime = z.infer<typeof activityGoalRuntimeSchema>;
export type ActivityDetail = z.infer<typeof activityDetailSchema>;
export type CanonicalActivityDetail = z.infer<typeof canonicalActivityDetailSchema>;
export type LegacyActivityReadModel = z.infer<typeof legacyActivityReadModelSchema>;
export type ActivityMaterializationResult = z.infer<typeof activityMaterializationResultSchema>;
