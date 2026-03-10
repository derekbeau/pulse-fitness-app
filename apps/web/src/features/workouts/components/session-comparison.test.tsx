import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkoutSession } from '@pulse/shared';

const WEIGHT_SECONDS_EXERCISE_ID = 'weighted-plank-hold';
const REPS_SECONDS_EXERCISE_ID = 'tempo-lunge-iso-hold';

vi.mock('../lib/tracking', async () => {
  const actual = await vi.importActual<typeof import('../lib/tracking')>('../lib/tracking');

  return {
    ...actual,
    getExerciseTrackingType: (exerciseId: string) => {
      if (exerciseId === WEIGHT_SECONDS_EXERCISE_ID) {
        return 'weight_seconds';
      }

      if (exerciseId === REPS_SECONDS_EXERCISE_ID) {
        return 'reps_seconds';
      }

      return actual.getExerciseTrackingType(exerciseId);
    },
  };
});

import { SessionExerciseComparison } from './session-comparison';

function createSession(overrides: Partial<WorkoutSession>): WorkoutSession {
  return {
    id: 'session-id',
    userId: 'user-1',
    templateId: 'template-1',
    name: 'Session',
    date: '2026-03-01',
    status: 'completed',
    startedAt: Date.parse('2026-03-01T18:00:00Z'),
    completedAt: Date.parse('2026-03-01T19:00:00Z'),
    duration: 60,
    feedback: {
      energy: 4 as const,
      recovery: 4 as const,
      technique: 4 as const,
    },
    notes: null,
    sets: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createSet(
  exerciseId: string,
  setNumber: number,
  reps: number | null,
  weight: number | null = null,
  extraFields: Record<string, number | null> = {},
) {
  return {
    id: `set-${exerciseId}-${setNumber}`,
    exerciseId,
    setNumber,
    weight,
    reps,
    completed: true,
    skipped: false,
    section: 'main' as const,
    notes: null,
    createdAt: 1,
    ...extraFields,
  };
}

describe('SessionExerciseComparison', () => {
  it('matches comparison rows by set number and supports reps-only PRs', () => {
    const previousSession = createSession({
      id: 'previous-session',
      startedAt: Date.parse('2026-02-20T18:00:00Z'),
      completedAt: Date.parse('2026-02-20T19:00:00Z'),
      sets: [
        createSet('bodyweight-row', 1, 7),
        createSet('bodyweight-row', 3, 8),
      ],
    });
    const currentSession = createSession({
      id: 'current-session',
      startedAt: Date.parse('2026-03-01T18:00:00Z'),
      completedAt: Date.parse('2026-03-01T19:00:00Z'),
      sets: [createSet('bodyweight-row', 3, 10)],
    });

    render(
      <SessionExerciseComparison
        currentSession={currentSession}
        exerciseId="bodyweight-row"
        previousSession={previousSession}
      />,
    );

    expect(screen.getByText('Set 3')).toBeInTheDocument();
    expect(screen.getByText('Reps +2')).toBeInTheDocument();
    expect(screen.getByText('PR')).toBeInTheDocument();
    expect(screen.queryByText('Reps +3')).not.toBeInTheDocument();
  });

  it('detects weight PRs for weight_seconds sets using seconds as the comparable metric', () => {
    const previousSession = createSession({
      id: 'previous-weighted-hold',
      startedAt: Date.parse('2026-02-24T18:00:00Z'),
      completedAt: Date.parse('2026-02-24T19:00:00Z'),
      sets: [createSet(WEIGHT_SECONDS_EXERCISE_ID, 1, 45, 100)],
    });
    const currentSession = createSession({
      id: 'current-weighted-hold',
      startedAt: Date.parse('2026-03-01T18:00:00Z'),
      completedAt: Date.parse('2026-03-01T19:00:00Z'),
      sets: [createSet(WEIGHT_SECONDS_EXERCISE_ID, 1, null, 105, { seconds: 45 })],
    });

    render(
      <SessionExerciseComparison
        currentSession={currentSession}
        exerciseId={WEIGHT_SECONDS_EXERCISE_ID}
        previousSession={previousSession}
      />,
    );

    expect(screen.getByText('Weight +5 lbs')).toBeInTheDocument();
    expect(screen.getByText('PR')).toBeInTheDocument();
  });

  it('uses reps as the set-level delta metric for reps_seconds exercises', () => {
    const previousSession = createSession({
      id: 'previous-reps-seconds',
      startedAt: Date.parse('2026-02-21T18:00:00Z'),
      completedAt: Date.parse('2026-02-21T19:00:00Z'),
      sets: [createSet(REPS_SECONDS_EXERCISE_ID, 1, 8, null, { seconds: 20 })],
    });
    const currentSession = createSession({
      id: 'current-reps-seconds',
      startedAt: Date.parse('2026-03-01T18:00:00Z'),
      completedAt: Date.parse('2026-03-01T19:00:00Z'),
      sets: [createSet(REPS_SECONDS_EXERCISE_ID, 1, 10, null, { seconds: 10 })],
    });

    render(
      <SessionExerciseComparison
        currentSession={currentSession}
        exerciseId={REPS_SECONDS_EXERCISE_ID}
        previousSession={previousSession}
      />,
    );

    expect(screen.getByText('Reps +2')).toBeInTheDocument();
    expect(screen.queryByText('Reps -8')).not.toBeInTheDocument();
  });
});
