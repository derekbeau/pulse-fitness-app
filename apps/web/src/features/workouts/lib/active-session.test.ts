import { describe, expect, it } from 'vitest';

import type { WorkoutSession } from '@/lib/mock-data/workouts';
import { mockTemplates } from '@/lib/mock-data/workouts';

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

    const sessions: WorkoutSession[] = [
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
        id: createWorkoutSetId('incline-dumbbell-press', 1),
        number: 1,
        reps: 10,
        weight: 50,
      },
      {
        completed: false,
        id: createWorkoutSetId('incline-dumbbell-press', 2),
        number: 2,
        reps: 9,
        weight: 50,
      },
    ];

    expect(countCompletedReps(drafts)).toBe(10);
  });
});
