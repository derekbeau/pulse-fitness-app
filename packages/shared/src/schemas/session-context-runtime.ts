import { z } from 'zod';

import {
  bodyConcernSchema,
  freshnessSchema,
  ianaTimeZoneSchema,
  journalObservationSchema,
  sessionContextReadModelSchema,
} from './activity-journal-contracts.js';
import { dateSchema } from './common.js';

const id = z.string().trim().min(1).max(255);
const foundation = sessionContextReadModelSchema.innerType();
const workloadItemSchema = z
  .object({
    identityKind: z.enum(['activity_execution', 'workout_session']),
    identityId: id,
    localDate: dateSchema,
    activityDurationMinutes: z.number().int().positive().nullable(),
    workoutDurationSeconds: z.number().int().nonnegative().nullable(),
    outcomeOrStatus: z.enum(['completed', 'partial', 'in-progress', 'paused']),
    sourceReference: z
      .object({
        kind: z.enum(['activity_execution', 'workout_session']),
        id,
        revisionId: id,
        subjectUserId: id,
      })
      .strict(),
    linkedActivityExecutionIds: z.array(id),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (
      item.sourceReference.kind !== item.identityKind ||
      item.sourceReference.id !== item.identityId ||
      (item.identityKind === 'activity_execution' &&
        (item.workoutDurationSeconds !== null ||
          item.linkedActivityExecutionIds.length > 0 ||
          !['completed', 'partial'].includes(item.outcomeOrStatus))) ||
      (item.identityKind === 'workout_session' &&
        (item.activityDurationMinutes !== null || item.outcomeOrStatus === 'partial'))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Workload identity and native duration must agree.',
      });
    }
  });

export const sessionContextRuntimeSchema = foundation
  .omit({ workoutSessionId: true })
  .extend({
    workoutSessionId: id.nullable(),
    localDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('workout_session'), workoutSessionId: id }).strict(),
      z.object({ kind: z.literal('local_date'), workoutSessionId: z.null() }).strict(),
    ]),
    trackedIrrelevantConcerns: z.array(bodyConcernSchema).max(50),
    journalObservations: z.array(journalObservationSchema).max(20),
    positiveFocusAttributions: z
      .array(
        z
          .object({
            capabilityId: id,
            sessionRelevance: z.enum(['guidance_linked', 'fallback_recent']),
            derivedFreshness: freshnessSchema,
          })
          .strict(),
      )
      .max(10),
    guidanceFreshnessAttributions: z
      .array(
        z
          .object({
            guidanceId: id,
            derivedFreshness: freshnessSchema,
          })
          .strict(),
      )
      .max(20),
    workload: z
      .object({
        window: z
          .object({
            startLocalDate: dateSchema,
            endLocalDate: dateSchema,
            timeZone: ianaTimeZoneSchema,
          })
          .strict(),
        items: z.array(workloadItemSchema).max(200),
        totals: z
          .object({
            activityExecutionCount: z.number().int().nonnegative(),
            workoutSessionCount: z.number().int().nonnegative(),
            activityDurationMinutes: z.number().int().nonnegative().nullable(),
            workoutDurationSeconds: z.number().int().nonnegative().nullable(),
          })
          .strict(),
      })
      .strict(),
    coOccurrences: z
      .array(
        z
          .object({
            observationKind: z.enum(['flare', 'journal']),
            observationId: id,
            loadKind: z.enum(['activity_execution', 'workout_session']),
            loadId: id,
            localDate: dateSchema,
            relationship: z.literal('same_local_date'),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.workoutSessionId !== value.target.workoutSessionId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target'],
        message: 'Target must match workoutSessionId.',
      });
    const owned = [
      ...value.positiveFocus,
      ...value.relevantConcerns,
      ...value.trackedIrrelevantConcerns,
      ...value.applicableGuidance,
      ...value.recentObservations,
      ...value.journalObservations,
    ];
    if (
      owned.some((item) => item.subjectUserId !== value.subjectUserId) ||
      value.workload.items.some(
        (item) => item.sourceReference.subjectUserId !== value.subjectUserId,
      )
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Read model must contain only subject-owned facts.',
      });
  });

export const sessionContextFoundationProjection = (
  value: z.infer<typeof sessionContextRuntimeSchema>,
) =>
  sessionContextReadModelSchema.parse({
    contractVersion: value.contractVersion,
    subjectUserId: value.subjectUserId,
    workoutSessionId: value.workoutSessionId,
    generatedAt: value.generatedAt,
    positiveFocus: value.positiveFocus,
    relevantConcerns: value.relevantConcerns,
    applicableGuidance: value.applicableGuidance,
    recentObservations: value.recentObservations,
    missingInputs: value.missingInputs,
  });

export type SessionContextRuntime = z.infer<typeof sessionContextRuntimeSchema>;
