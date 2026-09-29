import { describe, expect, it } from 'vitest';

import {
  activityAssignmentSchema,
  activityExecutionSchema,
  activityJournalErrorResponseSchema,
  activityRecurrenceRevisionSchema,
  canonicalActivitySchema,
  checkInAnswerRevisionSchema,
  classifyIdempotencyAttempt,
  immutableCorrectionRevisionSchema,
  isConcernManagementTransitionAllowed,
  meaningfulChangeProposalSchema,
  ownedEntityLinkSchema,
  provenanceSchema,
} from './activity-journal-contracts';
import {
  canonicalActivityFixture,
  correctionRevisionFixtures,
  fingerprintFixtures,
  idempotencyChangedPayloadFixture,
  idempotencyStoredFixture,
  initialRecurrenceRevisionFixture,
  meaningfulProposalFixture,
  ownedLinkNotFoundFixture,
  provenanceFixtures,
  revisedRecurrenceFixture,
  staleRevisionErrorFixture,
  thursdayExecutionFixture,
  tuesdayAssignmentFixture,
  unknownAnswerFixture,
} from './activity-journal-contracts.fixtures';

describe('activity and provenance contracts', () => {
  it('preserves all four provenance classes without collapsing their source', () => {
    const parsed = provenanceFixtures.map((fixture) => provenanceSchema.parse(fixture));

    expect(parsed.map((item) => item.class)).toEqual([
      'clinician_authored',
      'user_relayed_clinician',
      'user_observation',
      'agent_suggestion',
    ]);
    expect(new Set(parsed.map((item) => item.sourceId))).toHaveLength(4);
  });

  it('keeps the user subject distinct from the acting agent identity', () => {
    const activity = canonicalActivitySchema.parse(canonicalActivityFixture);

    expect(activity.subjectUserId).toBe('user-1');
    expect(activity.ownership.actor).toMatchObject({ kind: 'agent_token', id: 'agent-token-1' });
    expect(activity.source.capturedBy.kind).toBe('agent_token');
  });

  it('rejects a cross-user entity link and uses a non-disclosing rejection shape', () => {
    const link = {
      id: 'link-1',
      subjectUserId: 'user-1',
      source: {
        kind: 'activity',
        id: 'activity-1',
        subjectUserId: 'user-1',
        revisionId: null,
      },
      target: {
        kind: 'body_concern',
        id: 'concern-owned-by-user-2',
        subjectUserId: 'user-2',
        revisionId: null,
      },
      relation: 'concerns',
      createdAt: '2026-03-12T10:00:00-04:00',
    };

    expect(ownedEntityLinkSchema.safeParse(link).success).toBe(false);
    expect(activityJournalErrorResponseSchema.parse(ownedLinkNotFoundFixture)).toEqual(
      ownedLinkNotFoundFixture,
    );
    expect(ownedLinkNotFoundFixture.error.details).not.toHaveProperty('recordId');
  });

  it('keeps structured workout identity separate from activity identity', () => {
    const activity = canonicalActivitySchema.parse(canonicalActivityFixture);
    const execution = activityExecutionSchema.parse(thursdayExecutionFixture);

    expect(activity.id).toBe('activity-mobility-1');
    expect(activity.structuredWorkoutSessionId).toBeNull();
    expect(execution.activityId).toBe(activity.id);
    expect(execution.structuredWorkoutSessionId).toBeNull();
  });
});

describe('date, recurrence, and revision contracts', () => {
  it('preserves planned Tuesday separately from actual Thursday across a timezone boundary', () => {
    const assignment = activityAssignmentSchema.parse(tuesdayAssignmentFixture);
    const execution = activityExecutionSchema.parse(thursdayExecutionFixture);

    expect(assignment.plannedLocalDate).toBe('2026-03-10');
    expect(execution.actualLocalDate).toBe('2026-03-12');
    expect(execution.actualOccurredAt).toBe('2026-03-13T00:30:00Z');
    expect(execution.assignmentId).toBe(assignment.id);
  });

  it('rejects an actual local date that disagrees with the recorded timezone', () => {
    expect(
      activityExecutionSchema.safeParse({
        ...thursdayExecutionFixture,
        actualLocalDate: '2026-03-13',
      }).success,
    ).toBe(false);
  });

  it('applies recurrence revisions prospectively while preserving past assignment identity', () => {
    const initial = activityRecurrenceRevisionSchema.parse(initialRecurrenceRevisionFixture);
    const revised = activityRecurrenceRevisionSchema.parse(revisedRecurrenceFixture);
    const pastAssignment = activityAssignmentSchema.parse(tuesdayAssignmentFixture);

    expect(revised.priorRevisionId).toBe(initial.id);
    expect(revised.assignmentPolicy).toBe('unassigned_on_or_after_effective_date');
    expect(revised.effectiveFromLocalDate).toBe('2026-03-16');
    expect(pastAssignment.recurrenceRevisionId).toBe(initial.id);
    expect(pastAssignment.plannedLocalDate < revised.effectiveFromLocalDate).toBe(true);
  });

  it('retains immutable correction history and exposes a visible stale conflict', () => {
    const [prior, correction] = correctionRevisionFixtures.map((fixture) =>
      immutableCorrectionRevisionSchema.parse(fixture),
    );

    expect(correction.priorRevisionId).toBe(prior.id);
    expect(prior.correctedFields).toEqual({ durationMinutes: 5 });
    expect(correction.correctedFields).toEqual({ durationMinutes: 7 });
    expect(activityJournalErrorResponseSchema.parse(staleRevisionErrorFixture)).toEqual(
      staleRevisionErrorFixture,
    );
  });
});

describe('retry, check-in, and approval contracts', () => {
  it('distinguishes a duplicate retry from a changed-payload idempotency conflict', () => {
    expect(classifyIdempotencyAttempt(null, idempotencyStoredFixture)).toBe('new');
    expect(classifyIdempotencyAttempt(idempotencyStoredFixture, idempotencyStoredFixture)).toBe(
      'replay',
    );
    expect(
      classifyIdempotencyAttempt(idempotencyStoredFixture, idempotencyChangedPayloadFixture),
    ).toBe('conflict');
  });

  it('scopes idempotency keys by subject, route, and operation', () => {
    expect(
      classifyIdempotencyAttempt(idempotencyStoredFixture, {
        ...idempotencyStoredFixture,
        scope: { ...idempotencyStoredFixture.scope, subjectUserId: 'user-2' },
      }),
    ).toBe('new');
  });

  it('keeps unknown distinct from an answered negative', () => {
    const unknown = checkInAnswerRevisionSchema.parse(unknownAnswerFixture);
    const negative = checkInAnswerRevisionSchema.parse({
      ...unknownAnswerFixture,
      id: 'answer-revision-2',
      answerId: 'answer-2',
      state: 'answered',
      value: 'No',
    });

    expect(unknown.state).toBe('unknown');
    expect(unknown).not.toHaveProperty('value');
    expect(negative).toMatchObject({ state: 'answered', value: 'No' });
  });

  it('cannot represent a meaningful proposal as approved without explicit bound approval', () => {
    const proposed = meaningfulChangeProposalSchema.parse(meaningfulProposalFixture);
    expect(proposed).toMatchObject({ state: 'proposed', approval: null });

    expect(
      meaningfulChangeProposalSchema.safeParse({
        ...meaningfulProposalFixture,
        state: 'approved',
        approval: null,
      }).success,
    ).toBe(false);
  });

  it('binds approval to both the exact proposal revision and target revision set', () => {
    const approved = {
      ...meaningfulProposalFixture,
      state: 'approved',
      approval: {
        proposalRevisionId: meaningfulProposalFixture.proposalRevisionId,
        targetRevisionFingerprint: fingerprintFixtures.fingerprintC,
        approvedBy: { kind: 'user', id: 'user-1', label: 'Test user' },
        approvedAt: '2026-03-12T10:15:00-04:00',
      },
    };

    expect(meaningfulChangeProposalSchema.safeParse(approved).success).toBe(true);
    expect(
      meaningfulChangeProposalSchema.safeParse({
        ...approved,
        approval: {
          ...approved.approval,
          targetRevisionFingerprint: fingerprintFixtures.fingerprintB,
        },
      }).success,
    ).toBe(false);
  });

  it('requires a user actor for meaningful approval', () => {
    expect(
      meaningfulChangeProposalSchema.safeParse({
        ...meaningfulProposalFixture,
        state: 'approved',
        approval: {
          proposalRevisionId: meaningfulProposalFixture.proposalRevisionId,
          targetRevisionFingerprint: fingerprintFixtures.fingerprintC,
          approvedBy: { kind: 'agent_token', id: 'agent-token-1', label: 'Test agent' },
          approvedAt: '2026-03-12T10:15:00-04:00',
        },
      }).success,
    ).toBe(false);
  });

  it('uses explicit conservative concern transitions', () => {
    expect(isConcernManagementTransitionAllowed('active', 'maintenance')).toBe(true);
    expect(isConcernManagementTransitionAllowed('maintenance', 'active')).toBe(true);
    expect(isConcernManagementTransitionAllowed('resolved', 'active')).toBe(true);
    expect(isConcernManagementTransitionAllowed('archived', 'active')).toBe(false);
  });
});
