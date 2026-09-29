import { z } from 'zod';

import {
  activityJournalActorSchema,
  bodyConcernSchema,
  capabilitySchema,
  concernManagementStateSchema,
  concernSymptomStateSchema,
  freshnessSchema,
  ianaTimeZoneSchema,
  ownedEntityReferenceSchema,
  provenanceClassSchema,
  provenanceSchema,
  uncertaintyStateSchema,
} from './activity-journal-contracts.js';
import { dateSchema } from './common.js';

const idSchema = z.string().trim().min(1).max(255);
const shortTextSchema = z.string().trim().min(1).max(255);
const longTextSchema = z.string().trim().min(1).max(10_000);
const instantSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const agentRelayActorSchema = activityJournalActorSchema
  .extend({ kind: z.literal('agent_token') })
  .strict();

const localDateForInstant = (value: string, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone,
    }).formatToParts(new Date(value));
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
};

export const bodyContextIdempotencyKeySchema = z.string().trim().min(8).max(255);

export const bodyContextProvenanceInputSchema = z
  .object({
    class: provenanceClassSchema,
    sourceId: idSchema,
    sourceLabel: shortTextSchema,
    sourceOccurredAt: instantSchema.nullable(),
    uncertainty: uncertaintyStateSchema,
    freshness: freshnessSchema,
  })
  .strict();

export const bodyContextListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const createBodyConcernApiInputSchema = z
  .object({
    label: shortTextSchema,
    bodyRegion: shortTextSchema.nullable().default(null),
    symptomState: concernSymptomStateSchema,
    managementState: concernManagementStateSchema,
    source: bodyContextProvenanceInputSchema,
    legacyHealthConditionId: idSchema.nullable().default(null),
    idempotencyKey: bodyContextIdempotencyKeySchema,
  })
  .strict();

export const correctBodyConcernApiInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    correctedFields: z
      .object({
        label: shortTextSchema.optional(),
        bodyRegion: shortTextSchema.nullable().optional(),
        symptomState: concernSymptomStateSchema.optional(),
        source: bodyContextProvenanceInputSchema.optional(),
      })
      .strict()
      .refine((fields) => Object.keys(fields).length > 0, {
        message: 'A concern correction must change at least one field.',
      }),
    reason: longTextSchema,
    idempotencyKey: bodyContextIdempotencyKeySchema,
  })
  .strict();

export const explicitManagementDecisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('authenticated_user') }).strict(),
  z
    .object({
      kind: z.literal('agent_relay'),
      statement: longTextSchema,
      sourceId: idSchema,
      sourceOccurredAt: instantSchema,
    })
    .strict(),
]);

export const transitionBodyConcernApiInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    to: concernManagementStateSchema,
    reason: longTextSchema,
    source: bodyContextProvenanceInputSchema,
    explicitDecision: explicitManagementDecisionSchema.nullable().default(null),
    idempotencyKey: bodyContextIdempotencyKeySchema,
  })
  .strict();

export const flareFollowUpQuestionSchema = z
  .object({
    key: z.enum([
      'safe_to_continue',
      'new_neurologic_symptoms',
      'movement_limit',
      'clinician_contact',
      'other_safety_material',
    ]),
    prompt: longTextSchema,
  })
  .strict();

export const recordBodyFlareApiInputSchema = z
  .object({
    occurredAt: instantSchema,
    localDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    observation: longTextSchema,
    source: bodyContextProvenanceInputSchema,
    followUpQuestions: z.array(flareFollowUpQuestionSchema).max(5).default([]),
    idempotencyKey: bodyContextIdempotencyKeySchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (localDateForInstant(value.occurredAt, value.timeZone) !== value.localDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['localDate'],
        message: 'localDate must match occurredAt in timeZone.',
      });
    }
  });

export const createBodyCapabilityApiInputSchema = z
  .object({
    label: shortTextSchema,
    state: z.enum(['developing', 'stable', 'limited', 'unknown']),
    source: bodyContextProvenanceInputSchema,
    idempotencyKey: bodyContextIdempotencyKeySchema,
  })
  .strict();

export const correctBodyCapabilityApiInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    correctedFields: z
      .object({
        label: shortTextSchema.optional(),
        state: z.enum(['developing', 'stable', 'limited', 'unknown']).optional(),
        source: bodyContextProvenanceInputSchema.optional(),
      })
      .strict()
      .refine((fields) => Object.keys(fields).length > 0, {
        message: 'A capability correction must change at least one field.',
      }),
    reason: longTextSchema,
    idempotencyKey: bodyContextIdempotencyKeySchema,
  })
  .strict();

export const bodyGuidanceListQuerySchema = bodyContextListQuerySchema.extend({
  concernId: idSchema.optional(),
  capabilityId: idSchema.optional(),
});

export const createBodyGuidanceApiInputSchema = z
  .object({
    concernId: idSchema.nullable().default(null),
    capabilityId: idSchema.nullable().default(null),
    text: longTextSchema,
    source: bodyContextProvenanceInputSchema,
    idempotencyKey: bodyContextIdempotencyKeySchema,
  })
  .strict()
  .refine((value) => value.concernId !== null || value.capabilityId !== null, {
    message: 'Guidance must link to a concern or capability.',
    path: ['concernId'],
  });

export const correctBodyGuidanceApiInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    correctedFields: z
      .object({
        text: longTextSchema.optional(),
        state: z.enum(['current', 'superseded', 'retired']).optional(),
        source: bodyContextProvenanceInputSchema.optional(),
      })
      .strict()
      .refine((fields) => Object.keys(fields).length > 0, {
        message: 'A guidance correction must change at least one field.',
      }),
    reason: longTextSchema,
    idempotencyKey: bodyContextIdempotencyKeySchema,
  })
  .strict();

export const bodyConcernRuntimeSchema = bodyConcernSchema.extend({
  revision: z.number().int().positive(),
  legacyHealthConditionId: idSchema.nullable(),
});

export const bodyCapabilityRuntimeSchema = capabilitySchema.extend({
  revision: z.number().int().positive(),
  createdAt: instantSchema,
});

export const bodyGuidanceRuntimeSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    concernId: idSchema.nullable(),
    capabilityId: idSchema.nullable(),
    text: longTextSchema,
    source: provenanceSchema,
    state: z.enum(['current', 'superseded', 'retired']),
    currentRevisionId: idSchema,
    revision: z.number().int().positive(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .refine((value) => value.concernId !== null || value.capabilityId !== null, {
    message: 'Guidance must link to a concern or capability.',
    path: ['concernId'],
  });

export const bodyContextRevisionSchema = z
  .object({
    id: idSchema,
    recordId: idSchema,
    subjectUserId: idSchema,
    revision: z.number().int().positive(),
    priorRevisionId: idSchema.nullable(),
    changeKind: z.enum(['created', 'correction', 'transition', 'flare']),
    snapshot: z.record(z.string(), z.unknown()),
    correctedFields: z.record(z.string(), z.unknown()).nullable(),
    reason: z.string().nullable(),
    actor: activityJournalActorSchema,
    decisionAuthority: z.record(z.string(), z.unknown()).nullable(),
    createdAt: instantSchema,
  })
  .strict();

export const bodyFlareFollowUpSchema = flareFollowUpQuestionSchema.extend({
  id: idSchema,
  state: z.enum(['pending', 'answered', 'unknown', 'skipped']),
  answer: z.string().nullable(),
});

export const bodyFlareSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    concernId: idSchema,
    occurredAt: instantSchema,
    localDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    observation: longTextSchema,
    symptomState: z.literal('affirmed'),
    source: provenanceSchema,
    followUps: z.array(bodyFlareFollowUpSchema).max(5),
    createdAt: instantSchema,
  })
  .strict();

export const bodyConcernDetailSchema = z
  .object({
    concern: bodyConcernRuntimeSchema,
    revisions: z.array(bodyContextRevisionSchema),
    flares: z.array(bodyFlareSchema),
  })
  .strict();

export const bodyCapabilityDetailSchema = z
  .object({
    capability: bodyCapabilityRuntimeSchema,
    revisions: z.array(bodyContextRevisionSchema),
  })
  .strict();

export const bodyGuidanceDetailSchema = z
  .object({
    guidance: bodyGuidanceRuntimeSchema,
    revisions: z.array(bodyContextRevisionSchema),
  })
  .strict();

const activityAssignmentRescheduleEffectSchema = z
  .object({
    kind: z.literal('activity_assignment_reschedule'),
    assignmentId: idSchema,
    expectedRevision: z.number().int().positive(),
    plannedLocalDate: dateSchema,
    timeZone: ianaTimeZoneSchema,
    reason: longTextSchema,
  })
  .strict();

const scheduledWorkoutRescheduleEffectSchema = z
  .object({
    kind: z.literal('scheduled_workout_reschedule'),
    scheduledWorkoutId: idSchema,
    expectedUpdatedAt: z.number().int().positive(),
    plannedLocalDate: dateSchema,
    reason: longTextSchema,
  })
  .strict();

export const planChangeEffectSchema = z.discriminatedUnion('kind', [
  activityAssignmentRescheduleEffectSchema,
  scheduledWorkoutRescheduleEffectSchema,
]);

export const createPlanChangeProposalApiInputSchema = z
  .object({
    summary: longTextSchema,
    effects: z.array(planChangeEffectSchema).min(1).max(20),
    sourceReferences: z
      .array(
        ownedEntityReferenceSchema.refine(
          (reference) => ['body_concern', 'capability', 'guidance'].includes(reference.kind),
          'Proposal sources must be canonical body-context records.',
        ),
      )
      .max(20)
      .default([]),
    idempotencyKey: bodyContextIdempotencyKeySchema,
  })
  .strict();

export const revisePlanChangeProposalApiInputSchema = createPlanChangeProposalApiInputSchema
  .extend({ expectedProposalRevisionId: idSchema })
  .strict();

export const recordProposalApprovalStatementApiInputSchema = z
  .object({
    proposalRevisionId: idSchema,
    targetRevisionFingerprint: sha256Schema,
    statement: longTextSchema,
    sourceId: idSchema,
    sourceOccurredAt: instantSchema,
    idempotencyKey: bodyContextIdempotencyKeySchema,
  })
  .strict();

export const approvePlanChangeProposalApiInputSchema = z
  .object({
    proposalRevisionId: idSchema,
    targetRevisionFingerprint: sha256Schema,
    relayApprovalStatementId: idSchema.optional(),
    idempotencyKey: bodyContextIdempotencyKeySchema,
  })
  .strict();

export const planChangeProposalTargetSchema = z
  .object({
    reference: ownedEntityReferenceSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict();

export const proposalApprovalStatementSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    proposalId: idSchema,
    proposalRevisionId: idSchema,
    targetRevisionFingerprint: sha256Schema,
    statement: longTextSchema,
    sourceId: idSchema,
    sourceOccurredAt: instantSchema,
    recordedBy: agentRelayActorSchema,
    createdAt: instantSchema,
  })
  .strict();

// Read-only audit of captured claims. A statement is not an approval.
export const PROPOSAL_APPROVAL_STATEMENT_READ_LIMIT = 100;
export const proposalApprovalStatementListSchema = z
  .object({
    statements: z
      .array(proposalApprovalStatementSchema)
      .max(PROPOSAL_APPROVAL_STATEMENT_READ_LIMIT),
  })
  .strict();

export const proposalApprovalStatementReadLimitErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal('PROPOSAL_APPROVAL_STATEMENT_READ_LIMIT_EXCEEDED'),
        message: z.string(),
        details: z
          .object({
            scope: z.literal('proposal_approval_statements'),
            limit: z.literal(PROPOSAL_APPROVAL_STATEMENT_READ_LIMIT),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const planChangeProposalRevisionSchema = z
  .object({
    id: idSchema,
    proposalId: idSchema,
    subjectUserId: idSchema,
    revision: z.number().int().positive(),
    priorRevisionId: idSchema.nullable(),
    summary: longTextSchema,
    targets: z.array(planChangeProposalTargetSchema).min(1).max(20),
    effects: z.array(planChangeEffectSchema).min(1).max(20),
    sourceReferences: z.array(ownedEntityReferenceSchema).max(20),
    targetRevisionFingerprint: sha256Schema,
    proposedBy: activityJournalActorSchema,
    proposedAt: instantSchema,
  })
  .strict();

export const planChangeProposalSchema = z
  .object({
    id: idSchema,
    subjectUserId: idSchema,
    state: z.enum(['proposed', 'approved', 'stale']),
    currentRevisionId: idSchema,
    revision: z.number().int().positive(),
    summary: longTextSchema,
    targets: z.array(planChangeProposalTargetSchema).min(1).max(20),
    effects: z.array(planChangeEffectSchema).min(1).max(20),
    sourceReferences: z.array(ownedEntityReferenceSchema).max(20),
    targetRevisionFingerprint: sha256Schema,
    proposedBy: activityJournalActorSchema,
    proposedAt: instantSchema,
    approval: z
      .object({
        proposalRevisionId: idSchema,
        targetRevisionFingerprint: sha256Schema,
        approvedBy: z.object({
          kind: z.literal('user'),
          id: idSchema,
          label: z.string().nullable(),
        }),
        relayedBy: agentRelayActorSchema.nullable(),
        approvalStatementId: idSchema.nullable(),
        approvalStatement: proposalApprovalStatementSchema.nullable(),
        approvedAt: instantSchema,
      })
      .strict()
      .nullable(),
    execution: z
      .object({
        executedAt: instantSchema,
        effects: z.array(z.record(z.string(), z.unknown())),
      })
      .strict()
      .nullable(),
    revisions: z.array(planChangeProposalRevisionSchema),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .superRefine((proposal, context) => {
    const approval = proposal.approval;
    if (!approval) return;
    if (approval.approvedBy.id !== proposal.subjectUserId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approval', 'approvedBy', 'id'],
        message: 'Approval subject must match the proposal subject.',
      });
    }
    if (approval.relayedBy === null) {
      if (approval.approvalStatementId !== null || approval.approvalStatement !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['approval'],
          message: 'Direct user approval cannot carry a relayed approval statement.',
        });
      }
      return;
    }
    const statement = approval.approvalStatement;
    if (approval.approvalStatementId === null || statement === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approval'],
        message: 'Agent-relayed approval requires its persisted approval statement.',
      });
      return;
    }
    if (
      statement.id !== approval.approvalStatementId ||
      statement.subjectUserId !== proposal.subjectUserId ||
      statement.proposalId !== proposal.id ||
      statement.proposalRevisionId !== approval.proposalRevisionId ||
      statement.targetRevisionFingerprint !== approval.targetRevisionFingerprint ||
      statement.recordedBy.id !== approval.relayedBy.id
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approval', 'approvalStatement'],
        message:
          'Relayed approval audit must match its proposal, subject, revision, and relay actor.',
      });
    }
  });

export type BodyContextProvenanceInput = z.infer<typeof bodyContextProvenanceInputSchema>;
export type CreateBodyConcernApiInput = z.infer<typeof createBodyConcernApiInputSchema>;
export type CorrectBodyConcernApiInput = z.infer<typeof correctBodyConcernApiInputSchema>;
export type TransitionBodyConcernApiInput = z.infer<typeof transitionBodyConcernApiInputSchema>;
export type RecordBodyFlareApiInput = z.infer<typeof recordBodyFlareApiInputSchema>;
export type CreateBodyCapabilityApiInput = z.infer<typeof createBodyCapabilityApiInputSchema>;
export type CorrectBodyCapabilityApiInput = z.infer<typeof correctBodyCapabilityApiInputSchema>;
export type CreateBodyGuidanceApiInput = z.infer<typeof createBodyGuidanceApiInputSchema>;
export type CorrectBodyGuidanceApiInput = z.infer<typeof correctBodyGuidanceApiInputSchema>;
export type BodyConcernRuntime = z.infer<typeof bodyConcernRuntimeSchema>;
export type BodyCapabilityRuntime = z.infer<typeof bodyCapabilityRuntimeSchema>;
export type BodyGuidanceRuntime = z.infer<typeof bodyGuidanceRuntimeSchema>;
export type BodyConcernDetail = z.infer<typeof bodyConcernDetailSchema>;
export type BodyCapabilityDetail = z.infer<typeof bodyCapabilityDetailSchema>;
export type BodyGuidanceDetail = z.infer<typeof bodyGuidanceDetailSchema>;
export type BodyFlare = z.infer<typeof bodyFlareSchema>;
export type PlanChangeEffect = z.infer<typeof planChangeEffectSchema>;
export type CreatePlanChangeProposalApiInput = z.infer<
  typeof createPlanChangeProposalApiInputSchema
>;
export type RevisePlanChangeProposalApiInput = z.infer<
  typeof revisePlanChangeProposalApiInputSchema
>;
export type RecordProposalApprovalStatementApiInput = z.infer<
  typeof recordProposalApprovalStatementApiInputSchema
>;
export type ApprovePlanChangeProposalApiInput = z.infer<
  typeof approvePlanChangeProposalApiInputSchema
>;
export type PlanChangeProposal = z.infer<typeof planChangeProposalSchema>;
