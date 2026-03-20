import { describe, expect, it } from 'vitest';

import type { ActiveWorkoutHistoricalSession } from '../types';
import { mockTemplates } from '@/test/fixtures/workouts';

import {
  buildActiveWorkoutSession,
  countCompletedReps,
  createInitialWorkoutSetDrafts,
  createWorkoutSetId,
} from './active-session';

const activeTemplate = mockTemplates.find((template) => template.id === 'upper-push');

describe('active-session helpers', () => {
  it('includes form cues, notes, and the most recent prior performance for each exercise', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const sessions: ActiveWorkoutHistoricalSession[] = [
      {
        completedAt: '2026-03-01T11:00:00Z',
        duration: 60,
        exercises: [
          {
            exerciseId: 'incline-dumbbell-press',
            sets: [
              {
                completed: true,
                reps: 8,
                setNumber: 1,
                timestamp: '2026-03-01T10:20:00Z',
                weight: 20,
              },
            ],
          },
        ],
        id: 'session-upper-push-older',
        startedAt: '2026-03-01T10:00:00Z',
        status: 'completed',
        templateId: 'upper-push',
      },
      {
        completedAt: '2026-03-04T11:00:00Z',
        duration: 64,
        exercises: [
          {
            exerciseId: 'incline-dumbbell-press',
            sets: [
              {
                completed: true,
                reps: 10,
                setNumber: 1,
                timestamp: '2026-03-04T10:20:00Z',
                weight: 22.5,
              },
              {
                completed: true,
                reps: 9,
                setNumber: 2,
                timestamp: '2026-03-04T10:24:00Z',
                weight: 22.5,
              },
            ],
          },
        ],
        id: 'session-upper-push-latest',
        startedAt: '2026-03-04T10:00:00Z',
        status: 'completed',
        templateId: 'upper-push',
      },
    ];

    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set([createWorkoutSetId('row-erg', 1)])),
      {
        exerciseNotes: {
          'incline-dumbbell-press': 'Use the 30 degree bench.',
        },
        sessionStartedAt: '2026-03-06T12:00:00Z',
        sessions,
      },
    );

    const incline = session.sections
      .flatMap((section) => section.exercises)
      .find((exercise) => exercise.id === 'incline-dumbbell-press');

    expect(incline).toMatchObject({
      formCues: ['Drive feet into the floor', 'Keep wrists stacked over elbows'],
      injuryCues: [
        'Avoid the last 10 degrees of lockout if the left shoulder feels unstable.',
        'Cap the top set at RPE 8 while the SLAP tear is still active.',
      ],
      notes: 'Use the 30 degree bench.',
    });
    expect(incline?.lastPerformance).toEqual({
      date: '2026-03-04',
      sessionId: 'session-upper-push-latest',
      sets: [
        { completed: true, reps: 10, setNumber: 1, weight: 22.5 },
        { completed: true, reps: 9, setNumber: 2, weight: 22.5 },
      ],
    });
  });

  it('counts only reps from completed sets', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const drafts = createInitialWorkoutSetDrafts(activeTemplate, new Set());
    drafts['incline-dumbbell-press'] = [
      {
        completed: true,
        distance: null,
        id: createWorkoutSetId('incline-dumbbell-press', 1),
        number: 1,
        reps: 10,
        seconds: null,
        weight: 50,
      },
      {
        completed: false,
        distance: null,
        id: createWorkoutSetId('incline-dumbbell-press', 2),
        number: 2,
        reps: 9,
        seconds: null,
        weight: 50,
      },
    ];

    expect(countCompletedReps(drafts)).toBe(10);
  });

  it('uses template cue arrays even when enhanced injury metadata is unavailable', () => {
    const lowerTemplate = mockTemplates.find((template) => template.id === 'lower-quad-dominant');

    if (!lowerTemplate) {
      throw new Error('Expected lower-quad-dominant template in mock data.');
    }

    const session = buildActiveWorkoutSession(
      lowerTemplate,
      createInitialWorkoutSetDrafts(lowerTemplate, new Set()),
    );

    const squat = session.sections
      .flatMap((section) => section.exercises)
      .find((exercise) => exercise.id === 'high-bar-back-squat');

    expect(squat?.formCues.length).toBeGreaterThan(0);
    expect(squat?.injuryCues).toEqual([]);
  });

  it('uses template-provided exercise names when the exercise id is not in mock data', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const unknownExerciseTemplate = structuredClone(activeTemplate);
    const mainSection = unknownExerciseTemplate.sections[1];
    const firstExercise = mainSection?.exercises[0];
    if (!mainSection || !firstExercise) {
      throw new Error('Expected main section with exercises in template.');
    }
    mainSection.exercises[0] = {
      ...firstExercise,
      exerciseId: 'api-exercise-id-1',
      exerciseName: 'DB Bench Press QA',
    };

    const session = buildActiveWorkoutSession(
      unknownExerciseTemplate,
      createInitialWorkoutSetDrafts(unknownExerciseTemplate, new Set()),
    );
    const firstMainExercise = session.sections.find((section) => section.type === 'main')
      ?.exercises[0];

    expect(firstMainExercise?.name).toBe('DB Bench Press QA');
  });

  it('infers seconds-only tracking for unknown exercises with time-based prescribed reps', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const unknownExerciseTemplate = structuredClone(activeTemplate);
    const mainSection = unknownExerciseTemplate.sections[1];
    const firstExercise = mainSection?.exercises[0];
    if (!mainSection || !firstExercise) {
      throw new Error('Expected main section with exercises in template.');
    }

    mainSection.exercises[0] = {
      ...firstExercise,
      exerciseId: 'api-exercise-id-2',
      exerciseName: 'Wall Sit',
      reps: '30 sec',
    };

    const session = buildActiveWorkoutSession(
      unknownExerciseTemplate,
      createInitialWorkoutSetDrafts(unknownExerciseTemplate, new Set()),
    );
    const firstMainExercise = session.sections.find((section) => section.type === 'main')
      ?.exercises[0];

    expect(firstMainExercise?.trackingType).toBe('seconds_only');
  });

  it('honors explicit template tracking type for unknown exercises', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const unknownExerciseTemplate = structuredClone(activeTemplate);
    const mainSection = unknownExerciseTemplate.sections[1];
    const firstExercise = mainSection?.exercises[0];
    if (!mainSection || !firstExercise) {
      throw new Error('Expected main section with exercises in template.');
    }

    mainSection.exercises[0] = {
      ...firstExercise,
      exerciseId: 'dead-hang',
      exerciseName: 'Dead Hang',
      reps: '8',
      trackingType: 'seconds_only',
    };

    const session = buildActiveWorkoutSession(
      unknownExerciseTemplate,
      createInitialWorkoutSetDrafts(
        unknownExerciseTemplate,
        new Set([createWorkoutSetId('dead-hang', 1)]),
      ),
    );
    const firstMainExercise = session.sections.find((section) => section.type === 'main')
      ?.exercises[0];
    const firstSet = firstMainExercise?.sets[0];

    expect(firstMainExercise?.trackingType).toBe('seconds_only');
    expect(firstSet?.seconds).toBe(8);
    expect(firstSet?.reps).toBeNull();
    expect(firstSet?.weight).toBeNull();
  });

  it('honors explicit reps-only tracking type for unknown exercises', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const unknownExerciseTemplate = structuredClone(activeTemplate);
    const mainSection = unknownExerciseTemplate.sections[1];
    const firstExercise = mainSection?.exercises[0];
    if (!mainSection || !firstExercise) {
      throw new Error('Expected main section with exercises in template.');
    }

    mainSection.exercises[0] = {
      ...firstExercise,
      exerciseId: 'dead-bug',
      exerciseName: 'Dead Bug',
      reps: '12',
      trackingType: 'reps_only',
    };

    const session = buildActiveWorkoutSession(
      unknownExerciseTemplate,
      createInitialWorkoutSetDrafts(
        unknownExerciseTemplate,
        new Set([createWorkoutSetId('dead-bug', 1)]),
      ),
    );
    const firstMainExercise = session.sections.find((section) => section.type === 'main')
      ?.exercises[0];
    const firstSet = firstMainExercise?.sets[0];

    expect(firstMainExercise?.trackingType).toBe('reps_only');
    expect(firstSet?.reps).toBe(12);
    expect(firstSet?.seconds).toBeNull();
    expect(firstSet?.weight).toBeNull();
  });
});
