import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  sessionContextFoundationProjection,
  sessionContextRuntimeSchema,
} from './session-context-runtime.js';
import { sessionContextReadModelSchema } from './activity-journal-contracts.js';

export const emptySessionContext = {
  contractVersion: 'activity-journal-v1',
  subjectUserId: 'owner',
  workoutSessionId: 'session',
  generatedAt: '2026-09-19T16:00:00.000Z',
  localDate: '2026-09-19',
  timeZone: 'America/Detroit',
  target: { kind: 'workout_session', workoutSessionId: 'session' },
  positiveFocus: [],
  relevantConcerns: [],
  applicableGuidance: [],
  recentObservations: [],
  trackedIrrelevantConcerns: [],
  uncertainRelevanceConcerns: [],
  unknownSessionExerciseSetIds: [],
  journalObservations: [],
  positiveFocusAttributions: [],
  guidanceFreshnessAttributions: [],
  missingInputs: ['positive_focus', 'sleep', 'training_phase'],
  workload: {
    window: {
      startLocalDate: '2026-09-13',
      endLocalDate: '2026-09-19',
      timeZone: 'America/Detroit',
    },
    items: [],
    totals: {
      activityExecutionCount: 0,
      workoutSessionCount: 0,
      activityDurationMinutes: 0,
      workoutDurationSeconds: 0,
    },
  },
  coOccurrences: [],
};

describe('strict session context runtime', () => {
  it('parses the strict foundation projection and distinct date target', () => {
    const session = sessionContextRuntimeSchema.parse(emptySessionContext);
    expect(sessionContextReadModelSchema.safeParse(session).success).toBe(false);
    expect(
      sessionContextReadModelSchema.parse(sessionContextFoundationProjection(session))
        .workoutSessionId,
    ).toBe('session');
    expect(
      sessionContextRuntimeSchema.safeParse({
        ...emptySessionContext,
        workoutSessionId: null,
        target: { kind: 'local_date', workoutSessionId: null },
      }).success,
    ).toBe(true);
  });
  it.each(['recoveryScore', 'sleepStatus', 'trainingPhase', 'readiness', 'totalLoad'])(
    'rejects unsupported %s',
    (key) => {
      expect(
        sessionContextRuntimeSchema.safeParse({ ...emptySessionContext, [key]: 'fabricated' })
          .success,
      ).toBe(false);
    },
  );
  it('rejects a workload item with crossed identity or duration units', () => {
    const item = {
      identityKind: 'activity_execution',
      identityId: 'activity',
      localDate: '2026-09-19',
      activityDurationMinutes: 5,
      workoutDurationSeconds: 300,
      outcomeOrStatus: 'completed',
      sourceReference: {
        kind: 'activity_execution',
        id: 'activity',
        subjectUserId: 'owner',
        revisionId: 'r1',
      },
      linkedActivityExecutionIds: [],
    };
    expect(
      sessionContextRuntimeSchema.safeParse({
        ...emptySessionContext,
        workload: { ...emptySessionContext.workload, items: [item] },
      }).success,
    ).toBe(false);
  });
  it('parses both browser-readable fictional session payloads', () => {
    const html = readFileSync(
      new URL(
        '../../../../docs/implementation/activity-journal-181-fixtures/what-matters-two-sessions.html',
        import.meta.url,
      ),
      'utf8',
    );
    const encoded = html.match(
      /<script type="application\/json" id="fixtures">([\s\S]*?)<\/script>/u,
    )?.[1];
    if (!encoded) throw new Error('Fixture JSON is missing');
    const fixtures = JSON.parse(encoded) as Array<{ label: string; payload: unknown }>;
    expect(fixtures).toHaveLength(2);
    for (const fixture of fixtures) {
      const parsed = sessionContextRuntimeSchema.parse(fixture.payload);
      expect(
        sessionContextReadModelSchema.safeParse(sessionContextFoundationProjection(parsed)).success,
      ).toBe(true);
    }
  });
});
