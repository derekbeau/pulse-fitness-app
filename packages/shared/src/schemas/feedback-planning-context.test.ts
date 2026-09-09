import { describe, expect, it } from 'vitest';

import {
  applyFeedbackPrecautionDecisionInputSchema,
  feedbackPlanningContextQuerySchema,
  feedbackPlanningEvidenceSchema,
} from './feedback-planning-context.js';

describe('feedback planning context contracts', () => {
  it('defaults to an exact bounded 30-day planning window and rejects unbounded values', () => {
    expect(feedbackPlanningContextQuerySchema.parse({})).toEqual({
      view: 'planning',
      windowDays: 30,
      page: 1,
      limit: 20,
    });
    for (const windowDays of [-1, 0, 91, Number.POSITIVE_INFINITY]) {
      expect(feedbackPlanningContextQuerySchema.safeParse({ windowDays }).success).toBe(false);
    }
    expect(feedbackPlanningContextQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it('preserves false, zero, arrays, null, and missing as distinct native evidence', () => {
    const base = {
      id: 'evidence-1',
      projection: 'current' as const,
      classification: 'current_explicit' as const,
      actionable: true,
      contentRole: 'quoted_data' as const,
      question: {
        id: 'synthetic',
        version: 1,
        revisionId: 'question-revision-1',
        priorRevisionId: null,
        prompt: 'Exact synthetic prompt?',
        type: 'yes_no' as const,
        timing: 'post_session' as const,
        sourceKind: 'user',
        sourceActorId: 'owner-a',
        sourceActorName: null,
        authoredAt: '2026-09-08T12:00:00.000Z',
      },
      answer: {
        responseId: 'response-1',
        responseRevisionId: 'response-revision-1',
        revision: 1,
        priorRevisionId: null,
        state: 'answered' as const,
        nativeType: 'yes_no' as const,
        nativeValue: false,
        exactText: 'false',
        notes: null,
        answeredAt: '2026-09-08T13:00:00.000Z',
        respondentSource: 'user' as const,
        respondentActorId: 'owner-a',
      },
      session: {
        id: 'session-1',
        workoutName: 'Synthetic workout',
        date: '2026-09-08',
        startedAt: 1,
        completedAt: 2,
        updatedAt: 3,
      },
      context: {
        exerciseId: null,
        exerciseName: null,
        bodyRegion: null,
        laterality: null,
        concernRef: null,
        label: null,
      },
      source: {
        kind: 'native_feedback_response' as const,
        availability: 'available' as const,
        link: '/api/v1/workout-sessions/session-1',
        locator: {
          route: '/api/v1/workout-sessions/session-1',
          entityType: 'workout_feedback_answer' as const,
          entityId: 'response-revision-1',
          sessionId: 'session-1',
        },
        lastUpdatedAt: 3,
        stale: false,
        stalenessReasons: [],
      },
      dependencies: [{ kind: 'answer_revision' as const, id: 'response-revision-1', version: '1' }],
      dependencyFingerprint: 'a'.repeat(64),
    };

    expect(feedbackPlanningEvidenceSchema.parse(base).answer.nativeValue).toBe(false);
    expect(
      feedbackPlanningEvidenceSchema.parse({
        ...base,
        question: { ...base.question, type: 'scale' },
        answer: { ...base.answer, nativeType: 'scale', nativeValue: 0 },
      }).answer.nativeValue,
    ).toBe(0);
    expect(
      feedbackPlanningEvidenceSchema.parse({
        ...base,
        classification: 'unknown_skipped_unanswered',
        actionable: false,
        answer: {
          ...base.answer,
          responseId: null,
          responseRevisionId: null,
          revision: null,
          state: 'missing',
          nativeValue: null,
          exactText: null,
          answeredAt: null,
          respondentSource: null,
          respondentActorId: null,
        },
      }).answer.state,
    ).toBe('missing');
  });

  it('requires an explicit safeguard declaration at the authorized mutation boundary', () => {
    const input = {
      concernRef: 'synthetic-toe-flare',
      source: {
        sessionId: 'session-1',
        exerciseId: 'exercise-1',
        section: 'main',
        expectedTextHash: 'b'.repeat(64),
      },
      supportingResponseRevisionIds: ['response-revision-1'],
      disposition: 'retire',
      interpretation: 'Agent-authored interpretation, not medical clearance.',
      reason: 'Explicit activity-scoped response supports removing flare-specific text.',
      scheduledNoteMutations: [],
      idempotencyKey: 'decision-1',
    };
    expect(applyFeedbackPrecautionDecisionInputSchema.safeParse(input).success).toBe(false);
    expect(
      applyFeedbackPrecautionDecisionInputSchema.parse({
        ...input,
        safeguards: ['Stop if pain returns.'],
      }).safeguards,
    ).toEqual(['Stop if pain returns.']);
  });
});
