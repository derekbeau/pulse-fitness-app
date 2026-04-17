import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '@pulse/shared';

import { SessionComparison, SessionExerciseComparison } from './session-comparison';

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
    timeSegments: [],
    sectionDurations: {
      warmup: 0,
      main: 0,
      cooldown: 0,
      supplemental: 0,
    },
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
  reps: number,
  weight: number | null = null,
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
  };
}

describe('SessionExerciseComparison', () => {
  it('matches comparison rows by set number and supports reps-only PRs', () => {
    const previousSession = createSession({
      id: 'previous-session',
      startedAt: Date.parse('2026-02-20T18:00:00Z'),
      completedAt: Date.parse('2026-02-20T19:00:00Z'),
      sets: [createSet('bodyweight-row', 1, 7), createSet('bodyweight-row', 3, 8)],
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
});

describe('SessionComparison', () => {
  it('renders unit-aware volume values', () => {
    const previousSession = createSession({
      id: 'previous-session',
      startedAt: Date.parse('2026-02-20T18:00:00Z'),
      sets: [createSet('bench-press', 1, 8, 80)],
    });
    const currentSession = createSession({
      id: 'current-session',
      sets: [createSet('bench-press', 1, 10, 85)],
    });

    render(
      <SessionComparison
        currentSession={currentSession}
        previousSession={previousSession}
        weightUnit="kg"
      />,
    );

    expect(screen.getByText('850 kg')).toBeInTheDocument();
    expect(screen.getByText('640 kg')).toBeInTheDocument();
  });

  it('uses seconds metric labels for time-based sessions', () => {
    const previousSession = createSession({
      id: 'previous-session',
      startedAt: Date.parse('2026-02-20T18:00:00Z'),
      sets: [createSet('couch-stretch', 1, 60)],
    });
    const currentSession = createSession({
      id: 'current-session',
      sets: [createSet('couch-stretch', 1, 90)],
    });

    render(<SessionComparison currentSession={currentSession} previousSession={previousSession} />);

    expect(screen.getByText('Seconds progression')).toBeInTheDocument();
    expect(screen.getByText('90 sec')).toBeInTheDocument();
    expect(screen.getByText('60 sec')).toBeInTheDocument();
  });

  it('uses distance metric labels for distance-tracked sessions', () => {
    const previousSession = createSession({
      id: 'previous-session',
      startedAt: Date.parse('2026-02-20T18:00:00Z'),
      sets: [createSet('distance-run', 1, 1)],
    });
    const currentSession = createSession({
      id: 'current-session',
      sets: [createSet('distance-run', 1, 2.5)],
    });

    render(<SessionComparison currentSession={currentSession} previousSession={previousSession} />);

    expect(screen.getByText('Distance progression')).toBeInTheDocument();
    expect(screen.getByText('2.5 mi')).toBeInTheDocument();
    expect(screen.getByText('1 mi')).toBeInTheDocument();
  });

  it('shows mixed session volume as non-comparable', () => {
    const previousSession = createSession({
      id: 'previous-session',
      startedAt: Date.parse('2026-02-20T18:00:00Z'),
      sets: [createSet('distance-run', 1, 1.2), createSet('couch-stretch', 1, 60)],
    });
    const currentSession = createSession({
      id: 'current-session',
      sets: [createSet('distance-run', 1, 2.5), createSet('couch-stretch', 1, 90)],
    });

    render(<SessionComparison currentSession={currentSession} previousSession={previousSession} />);

    expect(screen.getByText('Mixed progression')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('+16%')).not.toBeInTheDocument();
  });
});
