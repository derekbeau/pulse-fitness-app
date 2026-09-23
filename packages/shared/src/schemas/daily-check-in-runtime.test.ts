import { describe, expect, it } from 'vitest';

import {
  createDailyCheckInQuestionApiInputSchema,
  dailyCheckInAnswerAuditRevisionSchema,
  dailyCheckInQuestionAuditRevisionSchema,
  dailyCheckInSourceReferenceSchema,
  dailyContextWorkoutSchema,
} from './daily-check-in-runtime.js';

const actor = { kind: 'agent_token' as const, id: 'agent-1', label: 'Agent 1' };
const source = {
  class: 'user_observation' as const,
  sourceId: 'fictional-source',
  sourceLabel: 'Fictional source',
  sourceOccurredAt: '2026-09-20T12:00:00.000Z',
  capturedAt: '2026-09-20T12:01:00.000Z',
  capturedBy: actor,
  uncertainty: 'known' as const,
  freshness: {
    state: 'current' as const,
    asOf: '2026-09-20T12:00:00.000Z',
    reasons: [],
  },
};

describe('daily check-in runtime contracts', () => {
  it('requires a current token for every accepted source and admits #179 nutrition sources', () => {
    expect(
      dailyCheckInSourceReferenceSchema.parse({
        kind: 'nutrition_log',
        id: 'nutrition-1',
        subjectUserId: 'owner',
        revisionId: `sha256:${'a'.repeat(64)}`,
      }),
    ).toBeDefined();
    const base = {
      localDate: '2026-09-20',
      semanticTopic: 'nutrition completeness',
      prompt: 'Is anything missing from today’s nutrition log?',
      followUpQuestionId: null,
      idempotencyKey: 'nutrition-question-179',
    };
    expect(
      createDailyCheckInQuestionApiInputSchema.safeParse({
        ...base,
        sourceReferences: [{ kind: 'meal', id: 'meal-1' }],
      }).success,
    ).toBe(false);
    expect(
      createDailyCheckInQuestionApiInputSchema.safeParse({
        ...base,
        sourceReferences: [
          { kind: 'journal_entry', id: 'journal-1', revisionId: 'journal-revision-1' },
        ],
      }).success,
    ).toBe(false);
  });

  it('represents planned, active, paused, and completed workouts without arbitrary statuses', () => {
    for (const [kind, status] of [
      ['planned', 'scheduled'],
      ['in_progress', 'in-progress'],
      ['paused', 'paused'],
      ['completed', 'completed'],
    ] as const) {
      expect(
        dailyContextWorkoutSchema.safeParse({
          id: `workout-${kind}`,
          kind,
          plannedLocalDate: kind === 'planned' ? '2026-09-20' : null,
          actualLocalDate: kind === 'planned' ? null : '2026-09-20',
          name: 'Fictional workout',
          status,
          scheduledWorkoutId: kind === 'planned' ? 'schedule-1' : null,
          workoutSessionId: kind === 'planned' ? null : 'session-1',
          sourceReference: {
            kind: kind === 'planned' ? 'scheduled_workout' : 'workout_session',
            id: kind === 'planned' ? 'schedule-1' : 'session-1',
            subjectUserId: 'owner',
            revisionId: `sha256:${'b'.repeat(64)}`,
          },
          sourceTime: null,
        }).success,
      ).toBe(true);
    }
  });

  it('keeps correction reason and recording actor strict while preserving answer-state rules', () => {
    const revision = {
      id: 'answer-revision-2',
      answerId: 'answer-1',
      questionId: 'question-1',
      questionRevisionId: 'question-revision-2',
      subjectUserId: 'owner',
      revision: 2,
      priorRevisionId: 'answer-revision-1',
      state: 'answered' as const,
      value: 'Clarified answer',
      source,
      answeredAt: '2026-09-20T12:02:00.000Z',
      correctionReason: 'User clarified.',
      recordedBy: actor,
    };
    expect(dailyCheckInAnswerAuditRevisionSchema.safeParse(revision).success).toBe(true);
    expect(
      dailyCheckInAnswerAuditRevisionSchema.safeParse({
        ...revision,
        state: 'unknown',
      }).success,
    ).toBe(false);
    expect(
      dailyCheckInAnswerAuditRevisionSchema.safeParse({ ...revision, rawRow: true }).success,
    ).toBe(false);
  });

  it('keeps root question creation distinct from the immutable audit recording time', () => {
    const auditRevision = {
      revision: {
        id: 'question-revision-2',
        questionId: 'question-1',
        subjectUserId: 'owner',
        revision: 2,
        priorRevisionId: 'question-revision-1',
        deduplicationKey: 'a'.repeat(64),
        prompt: 'What fictional audit detail changed?',
        state: 'answered' as const,
        sourceReferences: [
          {
            kind: 'body_concern',
            id: 'concern-1',
            subjectUserId: 'owner',
            revisionId: 'concern-revision-1',
          },
        ],
        createdAt: '2026-09-20T16:00:00.000Z',
      },
      recordedBy: actor,
      recordedAt: '2026-09-20T17:00:00.000Z',
    };
    expect(dailyCheckInQuestionAuditRevisionSchema.parse(auditRevision)).toEqual(auditRevision);
    expect(
      dailyCheckInQuestionAuditRevisionSchema.safeParse({
        revision: auditRevision.revision,
        recordedBy: actor,
      }).success,
    ).toBe(false);
  });
});
