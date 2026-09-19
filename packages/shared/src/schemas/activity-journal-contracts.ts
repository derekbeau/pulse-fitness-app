import { z } from 'zod';

import { dateSchema } from './common.js';

const idSchema = z.string().trim().min(1).max(255);
const shortTextSchema = z.string().trim().min(1).max(255);
const longTextSchema = z.string().trim().min(1).max(10_000);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const instantSchema = z.string().datetime({ offset: true });

export const activityJournalContractVersionSchema = z.literal('activity-journal-v1');

export const ianaTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, 'Invalid IANA time zone');

export const activityJournalActorSchema = z
  .object({
    kind: z.enum(['user', 'agent_token', 'system']),
    id: idSchema,
    label: shortTextSchema.nullable(),
  })
  .strict();

export const activityJournalOwnershipSchema = z
  .object({
    subjectUserId: idSchema,
    actor: activityJournalActorSchema,
  })
  .strict();

export const provenanceClassSchema = z.enum([
  'clinician_authored',
  'user_relayed_clinician',
  'user_observation',
  'agent_suggestion',
]);

export const uncertaintyStateSchema = z.enum(['known', 'uncertain', 'unknown']);
export const findingStateSchema = z.enum(['affirmed', 'denied', 'unknown', 'not_asked']);

export const freshnessSchema = z.discriminatedUnion('state', [
  z
    .object({
      state: z.literal('current'),
      asOf: instantSchema,
      reasons: z.array(shortTextSchema).length(0),
    })
    .strict(),
  z
    .object({
      state: z.literal('stale'),
      asOf: instantSchema,
      reasons: z.array(shortTextSchema).min(1).max(20),
    })
    .strict(),
  z
    .object({
      state: z.literal('unknown'),
      asOf: z.null(),
      reasons: z.array(shortTextSchema).min(1).max(20),
    })
    .strict(),
]);

export const provenanceSchema = z
  .object({
    class: provenanceClassSchema,
    sourceId: idSchema,
    sourceLabel: shortTextSchema,
    sourceOccurredAt: instantSchema.nullable(),
    capturedAt: instantSchema,
    capturedBy: activityJournalActorSchema,
    uncertainty: uncertaintyStateSchema,
    freshness: freshnessSchema,
  })
  .strict();

export const ownedEntityKindSchema = z.enum([
  'activity',
  'activity_assignment',
  'activity_execution',
  'activity_goal',
  'activity_recurrence_revision',
  'workout_session',
  'scheduled_workout',
  'body_concern',
  'capability',
  'guidance',
  'observation',
  'journal_entry',
  'check_in_question',
  'check_in_answer',
  'proposal',
]);

export const ownedEntityReferenceSchema = z
  .object({
    kind: ownedEntityKindSchema,
    id: idSchema,
    subjectUserId: idSchema,
    revisionId: idSchema.nullable(),
  })
  .strict();

export const ownedEntityLinkSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    source: ownedEntityReferenceSchema,
    target: ownedEntityReferenceSchema,
    relation: z.enum([
      'assignment_for',
      'execution_of',
      'supports_goal',
      'structured_workout_reference',
      'concerns',
      'guidance_for',
      'observed_during',
      'journal_source',
      'answers',
      'proposes_change_to',
    ]),
    createdAt: instantSchema,
  })
  .strict()
  .superRefine((link, context) => {
    if (link.source.subjectUserId !== link.subjectUserId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source', 'subjectUserId'],
        message: 'Source ownership must match the link subject.',
      });
    }
    if (link.target.subjectUserId !== link.subjectUserId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target', 'subjectUserId'],
        message: 'Target ownership must match the link subject.',
      });
    }
  });

export const activityGoalKindSchema = z.enum([
  'conditioning',
  'fat_loss',
  'physical_therapy',
  'mobility',
  'fun',
  'family',
  'other',
]);

export const activityGoalSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    kind: activityGoalKindSchema,
    label: shortTextSchema,
    state: z.enum(['active', 'paused', 'completed', 'archived']),
    createdAt: instantSchema,
  })
  .strict();

export const canonicalActivityKindSchema = z.enum([
  'walking',
  'running',
  'stretching',
  'yoga',
  'cycling',
  'swimming',
  'hiking',
  'physical_therapy',
  'mobility',
  'sport',
  'other',
]);

export const canonicalActivitySchema = z
  .object({
    contractVersion: activityJournalContractVersionSchema,
    id: idSchema,
    subjectUserId: idSchema,
    kind: canonicalActivityKindSchema,
    name: shortTextSchema,
    goalIds: z.array(idSchema).max(20),
    structuredWorkoutSessionId: idSchema.nullable(),
    ownership: activityJournalOwnershipSchema,
    source: provenanceSchema,
    revision: z.number().int().positive(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .refine((activity) => activity.ownership.subjectUserId === activity.subjectUserId, {
    message: 'Activity ownership must match the activity subject.',
    path: ['ownership', 'subjectUserId'],
  });

export const recurrenceFrequencySchema = z.enum(['daily', 'weekly', 'specific_weekdays']);

export const activityRecurrenceRevisionSchema = z
  .object({
    id: idSchema,
    recurrenceId: idSchema,
    subjectUserId: idSchema,
    sequence: z.number().int().positive(),
    priorRevisionId: idSchema.nullable(),
    effectiveFromLocalDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    frequency: recurrenceFrequencySchema,
    interval: z.number().int().positive().max(365),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    assignmentPolicy: z.literal('unassigned_on_or_after_effective_date'),
    createdAt: instantSchema,
    actor: activityJournalActorSchema,
  })
  .strict()
  .superRefine((revision, context) => {
    if (revision.frequency === 'specific_weekdays' && revision.weekdays.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weekdays'],
        message: 'Specific-weekday recurrence requires at least one weekday.',
      });
    }
    if (revision.sequence === 1 && revision.priorRevisionId !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priorRevisionId'],
        message: 'The initial recurrence revision cannot have a prior revision.',
      });
    }
    if (revision.sequence > 1 && revision.priorRevisionId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priorRevisionId'],
        message: 'A later recurrence revision must identify its prior revision.',
      });
    }
  });

export const activityAssignmentSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    activityId: idSchema,
    plannedLocalDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    recurrenceRevisionId: idSchema.nullable(),
    priorAssignmentRevisionId: idSchema.nullable(),
    revision: z.number().int().positive(),
    state: z.enum(['planned', 'completed', 'skipped', 'cancelled']),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict();

const localDateForInstant = (instant: string, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const activityExecutionSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    activityId: idSchema,
    assignmentId: idSchema.nullable(),
    actualOccurredAt: instantSchema,
    actualLocalDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    durationMinutes: z.number().int().positive().nullable(),
    outcome: z.enum(['completed', 'partial', 'skipped', 'unknown']),
    structuredWorkoutSessionId: idSchema.nullable(),
    source: provenanceSchema,
    createdAt: instantSchema,
  })
  .strict()
  .superRefine((execution, context) => {
    if (
      localDateForInstant(execution.actualOccurredAt, execution.timeZone) !==
      execution.actualLocalDate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actualLocalDate'],
        message: 'Actual local date must match the occurrence instant in the recorded time zone.',
      });
    }
  });

export const concernSymptomStateSchema = findingStateSchema;
export const concernManagementStateSchema = z.enum([
  'active',
  'monitoring',
  'maintenance',
  'resolved',
  'archived',
]);

const concernTransitions: Record<
  z.infer<typeof concernManagementStateSchema>,
  readonly string[]
> = {
  active: ['monitoring', 'maintenance', 'resolved'],
  monitoring: ['active', 'maintenance', 'resolved'],
  maintenance: ['active', 'monitoring', 'resolved'],
  resolved: ['active', 'archived'],
  archived: [],
};

export const isConcernManagementTransitionAllowed = (
  from: z.infer<typeof concernManagementStateSchema>,
  to: z.infer<typeof concernManagementStateSchema>,
) => from === to || concernTransitions[from].includes(to);

export const bodyConcernSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    label: shortTextSchema,
    bodyRegion: shortTextSchema.nullable(),
    symptomState: concernSymptomStateSchema,
    managementState: concernManagementStateSchema,
    source: provenanceSchema,
    currentRevisionId: idSchema,
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict();

export const capabilitySchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    label: shortTextSchema,
    state: z.enum(['developing', 'stable', 'limited', 'unknown']),
    source: provenanceSchema,
    currentRevisionId: idSchema,
    updatedAt: instantSchema,
  })
  .strict();

export const guidanceSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    concernId: idSchema.nullable(),
    capabilityId: idSchema.nullable(),
    text: longTextSchema,
    source: provenanceSchema,
    state: z.enum(['current', 'superseded', 'retired']),
    currentRevisionId: idSchema,
    createdAt: instantSchema,
  })
  .strict()
  .refine((value) => value.concernId !== null || value.capabilityId !== null, {
    message: 'Guidance must link to a concern or capability.',
    path: ['concernId'],
  });

export const healthObservationSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    category: z.enum(['health', 'nutrition', 'movement', 'injury']),
    text: longTextSchema,
    finding: findingStateSchema,
    occurredAt: instantSchema,
    localDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    source: provenanceSchema,
    concernIds: z.array(idSchema).max(20),
    capabilityIds: z.array(idSchema).max(20),
    activityExecutionIds: z.array(idSchema).max(20),
    workoutSessionIds: z.array(idSchema).max(20),
    currentRevisionId: idSchema,
  })
  .strict();

export const journalObservationSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    localDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    title: shortTextSchema,
    content: longTextSchema,
    category: z.enum(['health', 'nutrition', 'movement', 'injury', 'weekly_reflection']),
    sourceReferences: z.array(ownedEntityReferenceSchema).min(1).max(100),
    source: provenanceSchema,
    currentRevisionId: idSchema,
    createdAt: instantSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    entry.sourceReferences.forEach((reference, index) => {
      if (reference.subjectUserId !== entry.subjectUserId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceReferences', index, 'subjectUserId'],
          message: 'Journal source ownership must match the journal subject.',
        });
      }
    });
  });

export const checkInQuestionRevisionSchema = z
  .object({
    id: idSchema,
    questionId: idSchema,
    subjectUserId: idSchema,
    revision: z.number().int().positive(),
    priorRevisionId: idSchema.nullable(),
    deduplicationKey: sha256Schema,
    prompt: longTextSchema,
    state: z.enum(['pending', 'answered', 'retired']),
    sourceReferences: z.array(ownedEntityReferenceSchema).min(1).max(50),
    createdAt: instantSchema,
  })
  .strict();

export const checkInAnswerRevisionSchema = z
  .object({
    id: idSchema,
    answerId: idSchema,
    questionId: idSchema,
    questionRevisionId: idSchema,
    subjectUserId: idSchema,
    revision: z.number().int().positive(),
    priorRevisionId: idSchema.nullable(),
    state: z.enum(['answered', 'unknown', 'skipped']),
    value: longTextSchema.optional(),
    source: provenanceSchema,
    answeredAt: instantSchema,
  })
  .strict()
  .superRefine((answer, context) => {
    if (answer.state === 'answered' && answer.value === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'An answered check-in requires a value.',
      });
    }
    if (answer.state !== 'answered' && answer.value !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Unknown and skipped answers cannot carry a value.',
      });
    }
  });

export const immutableCorrectionRevisionSchema = z
  .object({
    id: idSchema,
    record: ownedEntityReferenceSchema,
    revision: z.number().int().positive(),
    priorRevisionId: idSchema.nullable(),
    correctedFields: z.record(z.string(), z.unknown()),
    reason: longTextSchema,
    actor: activityJournalActorSchema,
    createdAt: instantSchema,
  })
  .strict()
  .superRefine((revision, context) => {
    if (revision.revision === 1 && revision.priorRevisionId !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priorRevisionId'],
        message: 'Initial revision cannot replace another revision.',
      });
    }
    if (revision.revision > 1 && revision.priorRevisionId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priorRevisionId'],
        message: 'Correction must retain its prior revision link.',
      });
    }
  });

export const idempotencyScopeSchema = z
  .object({
    subjectUserId: idSchema,
    route: z.string().startsWith('/api/v1/'),
    operation: shortTextSchema,
  })
  .strict();

export const idempotencyAttemptSchema = z
  .object({
    key: z.string().trim().min(8).max(255),
    scope: idempotencyScopeSchema,
    requestFingerprint: sha256Schema,
  })
  .strict();

export type IdempotencyAttempt = z.infer<typeof idempotencyAttemptSchema>;

export const classifyIdempotencyAttempt = (
  stored: IdempotencyAttempt | null,
  incoming: IdempotencyAttempt,
): 'new' | 'replay' | 'conflict' => {
  if (stored === null) return 'new';
  const sameScope =
    stored.scope.subjectUserId === incoming.scope.subjectUserId &&
    stored.scope.route === incoming.scope.route &&
    stored.scope.operation === incoming.scope.operation;
  if (stored.key !== incoming.key || !sameScope) return 'new';
  return stored.requestFingerprint === incoming.requestFingerprint ? 'replay' : 'conflict';
};

const proposalTargetSchema = z
  .object({
    reference: ownedEntityReferenceSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict();

const proposalBaseSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    proposalRevisionId: idSchema,
    revision: z.number().int().positive(),
    priorRevisionId: idSchema.nullable(),
    changeKind: z.literal('meaningful'),
    summary: longTextSchema,
    targets: z.array(proposalTargetSchema).min(1).max(50),
    targetRevisionFingerprint: sha256Schema,
    proposedBy: activityJournalActorSchema,
    proposedAt: instantSchema,
  })
  .strict();

const userApprovalActorSchema = z
  .object({
    kind: z.literal('user'),
    id: idSchema,
    label: shortTextSchema.nullable(),
  })
  .strict();

const proposalApprovalSchema = z
  .object({
    proposalRevisionId: idSchema,
    targetRevisionFingerprint: sha256Schema,
    approvedBy: userApprovalActorSchema,
    approvedAt: instantSchema,
  })
  .strict();

export const meaningfulChangeProposalSchema = z
  .discriminatedUnion('state', [
    proposalBaseSchema.extend({ state: z.literal('proposed'), approval: z.null() }),
    proposalBaseSchema.extend({ state: z.literal('rejected'), approval: z.null() }),
    proposalBaseSchema.extend({ state: z.literal('withdrawn'), approval: z.null() }),
    proposalBaseSchema.extend({ state: z.literal('stale'), approval: z.null() }),
    proposalBaseSchema.extend({ state: z.literal('approved'), approval: proposalApprovalSchema }),
  ])
  .superRefine((proposal, context) => {
    if (proposal.state !== 'approved') return;
    if (proposal.approval.proposalRevisionId !== proposal.proposalRevisionId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approval', 'proposalRevisionId'],
        message: 'Approval must bind to the exact proposal revision.',
      });
    }
    if (proposal.approval.targetRevisionFingerprint !== proposal.targetRevisionFingerprint) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approval', 'targetRevisionFingerprint'],
        message: 'Approval is stale because target revisions changed.',
      });
    }
  });

export const routinePlanInstructionSchema = z
  .object({
    kind: z.literal('routine_direct_instruction'),
    subjectUserId: idSchema,
    instruction: longTextSchema,
    target: proposalTargetSchema,
    idempotency: idempotencyAttemptSchema,
    actor: activityJournalActorSchema,
    executedAt: instantSchema,
  })
  .strict();

export const createActivityInputSchema = z
  .object({
    subjectUserId: idSchema,
    kind: canonicalActivityKindSchema,
    name: shortTextSchema,
    goalIds: z.array(idSchema).max(20).default([]),
    source: provenanceSchema,
    actor: activityJournalActorSchema,
    idempotency: idempotencyAttemptSchema,
  })
  .strict();

export const createActivityAssignmentInputSchema = z
  .object({
    subjectUserId: idSchema,
    activityId: idSchema,
    plannedLocalDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    recurrenceRevisionId: idSchema.nullable(),
    actor: activityJournalActorSchema,
    idempotency: idempotencyAttemptSchema,
  })
  .strict();

export const rescheduleActivityAssignmentInputSchema = z
  .object({
    subjectUserId: idSchema,
    assignmentId: idSchema,
    expectedRevision: z.number().int().positive(),
    plannedLocalDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    reason: longTextSchema,
    actor: activityJournalActorSchema,
    idempotency: idempotencyAttemptSchema,
  })
  .strict();

export const recordActivityExecutionInputSchema = z
  .object({
    subjectUserId: idSchema,
    activityId: idSchema,
    assignmentId: idSchema.nullable(),
    actualOccurredAt: instantSchema,
    actualLocalDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    durationMinutes: z.number().int().positive().nullable(),
    outcome: z.enum(['completed', 'partial', 'skipped', 'unknown']),
    structuredWorkoutSessionId: idSchema.nullable(),
    source: provenanceSchema,
    actor: activityJournalActorSchema,
    idempotency: idempotencyAttemptSchema,
  })
  .strict()
  .superRefine((execution, context) => {
    if (
      localDateForInstant(execution.actualOccurredAt, execution.timeZone) !==
      execution.actualLocalDate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actualLocalDate'],
        message: 'Actual local date must match the occurrence instant in the recorded time zone.',
      });
    }
  });

export const createActivityRecurrenceRevisionInputSchema = z
  .object({
    recurrenceId: idSchema,
    subjectUserId: idSchema,
    sequence: z.number().int().positive(),
    priorRevisionId: idSchema.nullable(),
    effectiveFromLocalDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    frequency: recurrenceFrequencySchema,
    interval: z.number().int().positive().max(365),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    assignmentPolicy: z.literal('unassigned_on_or_after_effective_date'),
    actor: activityJournalActorSchema,
    idempotency: idempotencyAttemptSchema,
  })
  .strict();

export const correctOwnedRecordInputSchema = z
  .object({
    subjectUserId: idSchema,
    record: ownedEntityReferenceSchema,
    expectedRevision: z.number().int().positive(),
    correctedFields: z.record(z.string(), z.unknown()),
    reason: longTextSchema,
    actor: activityJournalActorSchema,
    idempotency: idempotencyAttemptSchema,
  })
  .strict();

export const recordConcernInputSchema = bodyConcernSchema
  .omit({ id: true, currentRevisionId: true, createdAt: true, updatedAt: true })
  .extend({ actor: activityJournalActorSchema, idempotency: idempotencyAttemptSchema })
  .strict();

export const transitionConcernInputSchema = z
  .object({
    subjectUserId: idSchema,
    concernId: idSchema,
    expectedRevision: z.number().int().positive(),
    from: concernManagementStateSchema,
    to: concernManagementStateSchema,
    reason: longTextSchema,
    source: provenanceSchema,
    actor: activityJournalActorSchema,
    idempotency: idempotencyAttemptSchema,
  })
  .strict()
  .refine((input) => isConcernManagementTransitionAllowed(input.from, input.to), {
    message: 'Concern management transition is not allowed.',
    path: ['to'],
  });

export const recordGuidanceInputSchema = z
  .object({
    subjectUserId: idSchema,
    concernId: idSchema.nullable(),
    capabilityId: idSchema.nullable(),
    text: longTextSchema,
    source: provenanceSchema,
    actor: activityJournalActorSchema,
    idempotency: idempotencyAttemptSchema,
  })
  .strict()
  .refine((value) => value.concernId !== null || value.capabilityId !== null, {
    message: 'Guidance must link to a concern or capability.',
    path: ['concernId'],
  });

export const recordFlareInputSchema = z
  .object({
    subjectUserId: idSchema,
    concernId: idSchema,
    occurredAt: instantSchema,
    localDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    observation: longTextSchema,
    symptomState: z.literal('affirmed'),
    source: provenanceSchema,
    followUpQuestions: z.array(longTextSchema).max(5),
    actor: activityJournalActorSchema,
    idempotency: idempotencyAttemptSchema,
  })
  .strict();

export const createCheckInQuestionInputSchema = checkInQuestionRevisionSchema
  .omit({
    id: true,
    questionId: true,
    revision: true,
    priorRevisionId: true,
    state: true,
    createdAt: true,
  })
  .extend({ actor: activityJournalActorSchema, idempotency: idempotencyAttemptSchema })
  .strict();

export const answerCheckInQuestionInputSchema = z
  .object({
    questionId: idSchema,
    questionRevisionId: idSchema,
    subjectUserId: idSchema,
    state: z.enum(['answered', 'unknown', 'skipped']),
    value: longTextSchema.optional(),
    source: provenanceSchema,
    expectedQuestionRevisionId: idSchema,
    expectedAnswerRevision: z.number().int().nonnegative(),
    actor: activityJournalActorSchema,
    idempotency: idempotencyAttemptSchema,
  })
  .strict()
  .superRefine((answer, context) => {
    if (answer.state === 'answered' && answer.value === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'An answered check-in requires a value.',
      });
    }
    if (answer.state !== 'answered' && answer.value !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Unknown and skipped answers cannot carry a value.',
      });
    }
  });

export const createJournalObservationInputSchema = z
  .object({
    subjectUserId: idSchema,
    localDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    title: shortTextSchema,
    content: longTextSchema,
    category: z.enum(['health', 'nutrition', 'movement', 'injury', 'weekly_reflection']),
    sourceReferences: z.array(ownedEntityReferenceSchema).min(1).max(100),
    source: provenanceSchema,
    actor: activityJournalActorSchema,
    idempotency: idempotencyAttemptSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    entry.sourceReferences.forEach((reference, index) => {
      if (reference.subjectUserId !== entry.subjectUserId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceReferences', index, 'subjectUserId'],
          message: 'Journal source ownership must match the journal subject.',
        });
      }
    });
  });

export const approveMeaningfulProposalInputSchema = z
  .object({
    subjectUserId: idSchema,
    proposalId: idSchema,
    proposalRevisionId: idSchema,
    targetRevisionFingerprint: sha256Schema,
    targetExpectedRevisions: z.array(proposalTargetSchema).min(1).max(50),
    approvedBy: userApprovalActorSchema,
    idempotency: idempotencyAttemptSchema,
  })
  .strict();

const ownedLinkNotFoundErrorSchema = z
  .object({
    code: z.literal('OWNED_LINK_NOT_FOUND'),
    message: z.string(),
    details: z.object({ linkRole: z.enum(['source', 'target']) }).strict(),
  })
  .strict();
const staleRevisionErrorSchema = z
  .object({
    code: z.literal('STALE_REVISION'),
    message: z.string(),
    details: z
      .object({
        recordId: idSchema,
        expectedRevision: z.number().int().nonnegative(),
        currentRevision: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
const idempotencyConflictErrorSchema = z
  .object({
    code: z.literal('IDEMPOTENCY_KEY_REUSE'),
    message: z.string(),
    details: z
      .object({
        key: z.string(),
        scope: idempotencyScopeSchema,
        storedRequestFingerprint: sha256Schema,
        requestFingerprint: sha256Schema,
      })
      .strict(),
  })
  .strict();
const staleProposalErrorSchema = z
  .object({
    code: z.literal('STALE_PROPOSAL'),
    message: z.string(),
    details: z
      .object({
        proposalId: idSchema,
        expectedProposalRevisionId: idSchema,
        currentProposalRevisionId: idSchema,
      })
      .strict(),
  })
  .strict();
const staleTargetErrorSchema = z
  .object({
    code: z.literal('STALE_TARGET'),
    message: z.string(),
    details: z
      .object({
        proposalId: idSchema,
        expectedTargetRevisionFingerprint: sha256Schema,
        currentTargetRevisionFingerprint: sha256Schema,
      })
      .strict(),
  })
  .strict();

export const activityJournalErrorResponseSchema = z
  .object({
    error: z.discriminatedUnion('code', [
      ownedLinkNotFoundErrorSchema,
      staleRevisionErrorSchema,
      idempotencyConflictErrorSchema,
      staleProposalErrorSchema,
      staleTargetErrorSchema,
    ]),
  })
  .strict();

export const dailyContextReadModelSchema = z
  .object({
    contractVersion: activityJournalContractVersionSchema,
    subjectUserId: idSchema,
    localDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    pendingQuestions: z.array(checkInQuestionRevisionSchema),
    currentAnswers: z.array(checkInAnswerRevisionSchema),
    observations: z.array(healthObservationSchema),
    assignments: z.array(activityAssignmentSchema),
    executions: z.array(activityExecutionSchema),
    concerns: z.array(bodyConcernSchema),
    capabilities: z.array(capabilitySchema),
    guidance: z.array(guidanceSchema),
    workoutSessionIds: z.array(idSchema),
    nutritionLocalDate: dateSchema,
    generatedAt: instantSchema,
  })
  .strict();

export const calendarReadItemSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    domain: z.enum(['activity', 'workout', 'journal', 'body_context', 'nutrition']),
    record: ownedEntityReferenceSchema,
    localDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    occurrenceAt: instantSchema.nullable(),
    state: z.enum(['planned', 'completed', 'observed', 'summary']),
    title: shortTextSchema,
  })
  .strict();

export const sessionContextReadModelSchema = z
  .object({
    contractVersion: activityJournalContractVersionSchema,
    subjectUserId: idSchema,
    workoutSessionId: idSchema,
    generatedAt: instantSchema,
    positiveFocus: z.array(capabilitySchema).max(10),
    relevantConcerns: z.array(bodyConcernSchema).max(20),
    applicableGuidance: z.array(guidanceSchema).max(20),
    recentObservations: z.array(healthObservationSchema).max(20),
    missingInputs: z.array(shortTextSchema).max(20),
  })
  .strict();

export const weeklyReflectionFactSchema = z
  .object({
    id: idSchema,
    localDate: dateSchema,
    summary: longTextSchema,
    sourceReferences: z.array(ownedEntityReferenceSchema).min(1).max(50),
  })
  .strict();

export const weeklyReflectionReadModelSchema = z
  .object({
    contractVersion: activityJournalContractVersionSchema,
    subjectUserId: idSchema,
    startLocalDate: dateSchema,
    endLocalDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    facts: z.array(weeklyReflectionFactSchema).max(100),
    gaps: z.array(shortTextSchema).max(50),
    generatedAt: instantSchema,
  })
  .strict();

export const calendarReadModelSchema = z
  .object({
    contractVersion: activityJournalContractVersionSchema,
    subjectUserId: idSchema,
    from: dateSchema,
    to: dateSchema,
    timeZone: ianaTimeZoneSchema,
    items: z.array(calendarReadItemSchema).max(10_000),
  })
  .strict();

export type ActivityJournalActor = z.infer<typeof activityJournalActorSchema>;
export type ActivityJournalOwnership = z.infer<typeof activityJournalOwnershipSchema>;
export type ProvenanceClass = z.infer<typeof provenanceClassSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type OwnedEntityReference = z.infer<typeof ownedEntityReferenceSchema>;
export type OwnedEntityLink = z.infer<typeof ownedEntityLinkSchema>;
export type ActivityGoal = z.infer<typeof activityGoalSchema>;
export type CanonicalActivity = z.infer<typeof canonicalActivitySchema>;
export type ActivityRecurrenceRevision = z.infer<typeof activityRecurrenceRevisionSchema>;
export type ActivityAssignment = z.infer<typeof activityAssignmentSchema>;
export type ActivityExecution = z.infer<typeof activityExecutionSchema>;
export type BodyConcern = z.infer<typeof bodyConcernSchema>;
export type Capability = z.infer<typeof capabilitySchema>;
export type Guidance = z.infer<typeof guidanceSchema>;
export type HealthObservation = z.infer<typeof healthObservationSchema>;
export type JournalObservation = z.infer<typeof journalObservationSchema>;
export type CheckInQuestionRevision = z.infer<typeof checkInQuestionRevisionSchema>;
export type CheckInAnswerRevision = z.infer<typeof checkInAnswerRevisionSchema>;
export type ImmutableCorrectionRevision = z.infer<typeof immutableCorrectionRevisionSchema>;
export type MeaningfulChangeProposal = z.infer<typeof meaningfulChangeProposalSchema>;
export type RoutinePlanInstruction = z.infer<typeof routinePlanInstructionSchema>;
export type CreateActivityInput = z.infer<typeof createActivityInputSchema>;
export type CreateActivityAssignmentInput = z.infer<typeof createActivityAssignmentInputSchema>;
export type RescheduleActivityAssignmentInput = z.infer<
  typeof rescheduleActivityAssignmentInputSchema
>;
export type RecordActivityExecutionInput = z.infer<typeof recordActivityExecutionInputSchema>;
export type CorrectOwnedRecordInput = z.infer<typeof correctOwnedRecordInputSchema>;
export type RecordFlareInput = z.infer<typeof recordFlareInputSchema>;
export type ApproveMeaningfulProposalInput = z.infer<typeof approveMeaningfulProposalInputSchema>;
export type ActivityJournalErrorResponse = z.infer<typeof activityJournalErrorResponseSchema>;
export type DailyContextReadModel = z.infer<typeof dailyContextReadModelSchema>;
export type CalendarReadItem = z.infer<typeof calendarReadItemSchema>;
export type SessionContextReadModel = z.infer<typeof sessionContextReadModelSchema>;
export type WeeklyReflectionReadModel = z.infer<typeof weeklyReflectionReadModelSchema>;
export type CalendarReadModel = z.infer<typeof calendarReadModelSchema>;
