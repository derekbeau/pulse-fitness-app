import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sessionContextRuntimeSchema } from '@pulse/shared';

import { workoutSessionContext } from './mock-data';
import { projectWhatMattersToday } from './session-context-migration';

const empty = {
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

describe('Session Context migration boundary', () => {
  it('rejects the legacy preview mock as runtime evidence', () => {
    expect(sessionContextRuntimeSchema.safeParse(workoutSessionContext).success).toBe(false);
  });
  it('projects only recorded facts and never emits recovery or phase fields', () => {
    const result = projectWhatMattersToday(sessionContextRuntimeSchema.parse(empty));
    expect(result.missingInputs).toContain('sleep');
    expect(result).not.toHaveProperty('sleepStatus');
    expect(result).not.toHaveProperty('trainingPhaseLabel');
    expect(result).not.toHaveProperty('activeInjuries');
    expect(result.focus).toEqual([]);
  });
  it('keeps the two fictional session projections distinct', () => {
    const html = readFileSync(
      resolve(
        process.cwd(),
        '../../docs/implementation/activity-journal-181-fixtures/what-matters-two-sessions.html',
      ),
      'utf8',
    );
    const encoded = html.match(
      /<script type="application\/json" id="fixtures">([\s\S]*?)<\/script>/u,
    )?.[1];
    if (!encoded) throw new Error('Fixture JSON is missing');
    const fixtures = JSON.parse(encoded) as Array<{ payload: unknown }>;
    const [upper, lower] = fixtures.map((fixture) =>
      projectWhatMattersToday(sessionContextRuntimeSchema.parse(fixture.payload)),
    );
    expect(upper.cautions.map((item) => item.id)).toEqual(['shoulder']);
    expect(lower.cautions).toEqual([]);
    expect(upper.focus.map((item) => item.id)).toEqual(['press']);
    expect(lower.focus.map((item) => item.id)).toEqual(['leg']);
  });
});
