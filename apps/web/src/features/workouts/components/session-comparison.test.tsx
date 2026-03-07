import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ActiveWorkoutCompletedSession } from '../types';

import { SessionExerciseComparison } from './session-comparison';

function createSession(
  overrides: Partial<ActiveWorkoutCompletedSession>,
): ActiveWorkoutCompletedSession {
  return {
    customFeedback: [],
    duration: 48,
    exercises: [],
    feedback: {
      energy: 4,
      notes: '',
      recovery: 4,
      technique: 4,
    },
    id: 'session-id',
    name: 'Session',
    notes: '',
    startedAt: '2026-03-01T18:00:00Z',
    status: 'completed',
    supplemental: [],
    templateId: 'template-1',
    ...overrides,
  };
}

describe('SessionExerciseComparison', () => {
  it('matches comparison rows by set number and supports reps-only PRs', () => {
    const previousSession = createSession({
      id: 'previous-session',
      startedAt: '2026-02-20T18:00:00Z',
      exercises: [
        {
          exerciseId: 'bodyweight-row',
          sets: [
            { completed: true, reps: 7, setNumber: 1, timestamp: '2026-02-20T18:05:00Z' },
            { completed: true, reps: 8, setNumber: 3, timestamp: '2026-02-20T18:10:00Z' },
          ],
        },
      ],
    });
    const currentSession = createSession({
      id: 'current-session',
      startedAt: '2026-03-01T18:00:00Z',
      exercises: [
        {
          exerciseId: 'bodyweight-row',
          sets: [{ completed: true, reps: 10, setNumber: 3, timestamp: '2026-03-01T18:12:00Z' }],
        },
      ],
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
});
