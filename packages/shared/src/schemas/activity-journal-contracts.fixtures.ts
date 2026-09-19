import type {
  ActivityAssignment,
  ActivityExecution,
  ActivityRecurrenceRevision,
  ActivityJournalErrorResponse,
  CanonicalActivity,
  CheckInAnswerRevision,
  IdempotencyAttempt,
  ImmutableCorrectionRevision,
  MeaningfulChangeProposal,
  Provenance,
} from './activity-journal-contracts.js';

const fingerprintA = 'a'.repeat(64);
const fingerprintB = 'b'.repeat(64);
const fingerprintC = 'c'.repeat(64);

export const userActor = { kind: 'user', id: 'user-1', label: 'Test user' } as const;
export const agentActor = {
  kind: 'agent_token',
  id: 'agent-token-1',
  label: 'Test agent',
} as const;

const provenanceBase = {
  sourceOccurredAt: '2026-03-12T00:30:00-04:00',
  capturedAt: '2026-03-12T00:35:00-04:00',
  uncertainty: 'known',
  freshness: {
    state: 'current',
    asOf: '2026-03-12T00:35:00-04:00',
    reasons: [] as string[],
  },
} as const;

export const provenanceFixtures = [
  {
    ...provenanceBase,
    class: 'clinician_authored',
    sourceId: 'document-1',
    sourceLabel: 'Uploaded clinician note',
    capturedBy: userActor,
  },
  {
    ...provenanceBase,
    class: 'user_relayed_clinician',
    sourceId: 'conversation-turn-1',
    sourceLabel: 'User relayed clinician guidance',
    capturedBy: agentActor,
  },
  {
    ...provenanceBase,
    class: 'user_observation',
    sourceId: 'conversation-turn-2',
    sourceLabel: 'User observation',
    capturedBy: agentActor,
  },
  {
    ...provenanceBase,
    class: 'agent_suggestion',
    sourceId: 'agent-suggestion-1',
    sourceLabel: 'Agent suggestion',
    capturedBy: agentActor,
  },
] satisfies Provenance[];

export const canonicalActivityFixture = {
  contractVersion: 'activity-journal-v1',
  id: 'activity-mobility-1',
  subjectUserId: 'user-1',
  kind: 'physical_therapy',
  name: 'Five-minute ankle mobility',
  goalIds: ['goal-pt-1', 'goal-mobility-1'],
  structuredWorkoutSessionId: null,
  ownership: { subjectUserId: 'user-1', actor: agentActor },
  source: provenanceFixtures[2],
  revision: 1,
  createdAt: '2026-03-09T10:00:00-04:00',
  updatedAt: '2026-03-09T10:00:00-04:00',
} satisfies CanonicalActivity;

export const tuesdayAssignmentFixture = {
  id: 'assignment-tuesday-1',
  subjectUserId: 'user-1',
  activityId: canonicalActivityFixture.id,
  plannedLocalDate: '2026-03-10',
  timeZone: 'America/Detroit',
  recurrenceRevisionId: 'recurrence-revision-1',
  priorAssignmentRevisionId: null,
  revision: 1,
  state: 'completed',
  createdAt: '2026-03-01T12:00:00-05:00',
  updatedAt: '2026-03-12T00:35:00-04:00',
} satisfies ActivityAssignment;

export const thursdayExecutionFixture = {
  id: 'execution-thursday-1',
  subjectUserId: 'user-1',
  activityId: canonicalActivityFixture.id,
  assignmentId: tuesdayAssignmentFixture.id,
  actualOccurredAt: '2026-03-13T00:30:00Z',
  actualLocalDate: '2026-03-12',
  timeZone: 'America/Detroit',
  durationMinutes: 5,
  outcome: 'completed',
  structuredWorkoutSessionId: null,
  source: provenanceFixtures[2],
  createdAt: '2026-03-13T00:35:00Z',
} satisfies ActivityExecution;

export const initialRecurrenceRevisionFixture = {
  id: 'recurrence-revision-1',
  recurrenceId: 'recurrence-1',
  subjectUserId: 'user-1',
  sequence: 1,
  priorRevisionId: null,
  effectiveFromLocalDate: '2026-03-01',
  timeZone: 'America/Detroit',
  frequency: 'specific_weekdays',
  interval: 1,
  weekdays: [2],
  assignmentPolicy: 'unassigned_on_or_after_effective_date',
  createdAt: '2026-02-20T12:00:00-05:00',
  actor: userActor,
} satisfies ActivityRecurrenceRevision;

export const revisedRecurrenceFixture = {
  id: 'recurrence-revision-2',
  recurrenceId: 'recurrence-1',
  subjectUserId: 'user-1',
  sequence: 2,
  priorRevisionId: initialRecurrenceRevisionFixture.id,
  effectiveFromLocalDate: '2026-03-16',
  timeZone: 'America/Detroit',
  frequency: 'specific_weekdays',
  interval: 1,
  weekdays: [4],
  assignmentPolicy: 'unassigned_on_or_after_effective_date',
  createdAt: '2026-03-12T09:00:00-04:00',
  actor: userActor,
} satisfies ActivityRecurrenceRevision;

export const correctionRevisionFixtures = [
  {
    id: 'correction-revision-1',
    record: {
      kind: 'activity_execution',
      id: thursdayExecutionFixture.id,
      subjectUserId: 'user-1',
      revisionId: 'execution-revision-1',
    },
    revision: 1,
    priorRevisionId: null,
    correctedFields: { durationMinutes: 5 },
    reason: 'Initial captured value',
    actor: agentActor,
    createdAt: '2026-03-13T00:35:00Z',
  },
  {
    id: 'correction-revision-2',
    record: {
      kind: 'activity_execution',
      id: thursdayExecutionFixture.id,
      subjectUserId: 'user-1',
      revisionId: 'execution-revision-2',
    },
    revision: 2,
    priorRevisionId: 'correction-revision-1',
    correctedFields: { durationMinutes: 7 },
    reason: 'User corrected the duration',
    actor: userActor,
    createdAt: '2026-03-13T01:00:00Z',
  },
] satisfies ImmutableCorrectionRevision[];

export const idempotencyStoredFixture = {
  key: 'activity-create-request-1',
  scope: {
    subjectUserId: 'user-1',
    route: '/api/v1/activities',
    operation: 'create_activity',
  },
  requestFingerprint: fingerprintA,
} satisfies IdempotencyAttempt;

export const idempotencyChangedPayloadFixture = {
  ...idempotencyStoredFixture,
  requestFingerprint: fingerprintB,
} satisfies IdempotencyAttempt;

export const meaningfulProposalFixture = {
  id: 'proposal-1',
  subjectUserId: 'user-1',
  proposalRevisionId: 'proposal-revision-1',
  revision: 1,
  priorRevisionId: null,
  changeKind: 'meaningful',
  summary: 'Reduce the next two lower-body sessions while the flare is assessed.',
  targets: [
    {
      reference: {
        kind: 'scheduled_workout',
        id: 'scheduled-workout-1',
        subjectUserId: 'user-1',
        revisionId: 'scheduled-workout-revision-4',
      },
      expectedRevision: 4,
    },
  ],
  targetRevisionFingerprint: fingerprintC,
  proposedBy: agentActor,
  proposedAt: '2026-03-12T10:00:00-04:00',
  state: 'proposed',
  approval: null,
} satisfies MeaningfulChangeProposal;

export const unknownAnswerFixture = {
  id: 'answer-revision-1',
  answerId: 'answer-1',
  questionId: 'question-1',
  questionRevisionId: 'question-revision-1',
  subjectUserId: 'user-1',
  revision: 1,
  priorRevisionId: null,
  state: 'unknown',
  source: provenanceFixtures[2],
  answeredAt: '2026-03-12T10:10:00-04:00',
} satisfies CheckInAnswerRevision;

export const ownedLinkNotFoundFixture = {
  error: {
    code: 'OWNED_LINK_NOT_FOUND',
    message: 'Linked record was not found.',
    details: { linkRole: 'target' },
  },
} satisfies ActivityJournalErrorResponse;

export const staleRevisionErrorFixture = {
  error: {
    code: 'STALE_REVISION',
    message: 'The record changed before this correction was applied.',
    details: { recordId: 'execution-thursday-1', expectedRevision: 1, currentRevision: 2 },
  },
} satisfies ActivityJournalErrorResponse;

export const fingerprintFixtures = { fingerprintA, fingerprintB, fingerprintC };
