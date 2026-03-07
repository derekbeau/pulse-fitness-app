import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { mockTemplates } from '@/lib/mock-data/workouts';

import {
  buildActiveWorkoutSession,
  createInitialWorkoutSetDrafts,
  createWorkoutSetId,
} from '../lib/active-session';
import { SessionExerciseList } from './session-exercise-list';

const activeTemplate = mockTemplates.find((template) => template.id === 'upper-push');
const lowerTemplate = mockTemplates.find((template) => template.id === 'lower-quad-dominant');

describe('SessionExerciseList', () => {
  it('shows editable set rows for the current exercise and can render the rest timer panel', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(
        activeTemplate,
        new Set([
          createWorkoutSetId('row-erg', 1),
          createWorkoutSetId('banded-shoulder-external-rotation', 1),
          createWorkoutSetId('banded-shoulder-external-rotation', 2),
          createWorkoutSetId('incline-dumbbell-press', 1),
          createWorkoutSetId('incline-dumbbell-press', 2),
        ]),
      ),
      {
        exerciseNotes: {
          'incline-dumbbell-press': 'Bench one notch lower than usual.',
        },
        sessionStartedAt: '2026-03-06T12:00:00Z',
      },
    );

    render(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRestTimerComplete={vi.fn()}
        onSetUpdate={vi.fn()}
        restTimer={{ duration: 90, exerciseName: 'Incline Dumbbell Press', setNumber: 2, token: 1 }}
        session={session}
      />,
    );

    expect(screen.getByText('Warmup (2/2 exercises done)')).toBeInTheDocument();
    expect(screen.getByText('Main (0/4 exercises done)')).toBeInTheDocument();
    expect(screen.getByText('Rest Timer')).toBeInTheDocument();
    expect(screen.getByText('After Incline Dumbbell Press')).toBeInTheDocument();
    expect(screen.getByText('Superset')).toBeInTheDocument();
    expect(
      screen.getByText('Alternate exercises, then rest 60s after each round.'),
    ).toBeInTheDocument();

    const currentExercise = screen.getByRole('heading', {
      level: 3,
      name: 'Incline Dumbbell Press',
    });
    const currentCard = currentExercise.closest('[data-slot="card"]');

    expect(currentCard).not.toBeNull();
    expect(within(currentCard as HTMLElement).getByText('Moderate')).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getByText('Current')).toBeInTheDocument();
    expect(
      within(currentCard as HTMLElement).getByLabelText('Weight for set 1'),
    ).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getByLabelText('Reps for set 3')).toBeInTheDocument();
    expect(
      within(currentCard as HTMLElement).getByRole('button', { name: 'Add Set' }),
    ).toBeInTheDocument();
    expect(
      within(currentCard as HTMLElement).getByText(
        /Last time .*24 x 10 reps • 24 x 9 reps • 24 x 8 reps/i,
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(currentCard as HTMLElement).getByRole('button', { name: /Form Cues/i }));
    expect(within(currentCard as HTMLElement).getByText('Technique')).toBeVisible();
    expect(
      within(currentCard as HTMLElement).getByText(
        'Press with a slight neutral grip, keep forearms stacked, and control a 3-second eccentric into the upper chest.',
      ),
    ).toBeVisible();
    expect(within(currentCard as HTMLElement).getByText('Mental Cues')).toBeVisible();
    expect(
      within(currentCard as HTMLElement).getByText('Drive upper back into the bench'),
    ).toBeVisible();
    expect(within(currentCard as HTMLElement).getByText('Common Mistakes')).toBeVisible();
    expect(
      within(currentCard as HTMLElement).getByText('Losing the shoulder blade set-up'),
    ).toBeVisible();
    expect(within(currentCard as HTMLElement).getByText('Injury-aware cues')).toBeVisible();
    expect(
      within(currentCard as HTMLElement).getByText(
        'Avoid the last 10 degrees of lockout if the left shoulder feels unstable.',
      ),
    ).toBeVisible();

    const notesInput = within(currentCard as HTMLElement).getByLabelText('Session notes');
    expect(notesInput).toHaveValue('Bench one notch lower than usual.');

    const optionalExercise = screen.getByRole('heading', {
      level: 3,
      name: 'Rope Triceps Pushdown',
    });
    const optionalCard = optionalExercise.closest('[data-slot="card"]');

    expect(optionalCard).not.toBeNull();
    expect(within(optionalCard as HTMLElement).getByText('Optional')).toBeInTheDocument();
  });

  it('omits cue toggles and injury warnings when enhanced cue data is unavailable', () => {
    if (!lowerTemplate) {
      throw new Error('Expected lower-quad-dominant template in mock data.');
    }

    const session = buildActiveWorkoutSession(
      lowerTemplate,
      createInitialWorkoutSetDrafts(lowerTemplate, new Set()),
    );

    render(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRestTimerComplete={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Main/i }));

    const squatCard = screen
      .getByRole('heading', { level: 3, name: 'High-Bar Back Squat' })
      .closest('[data-slot="card"]');

    expect(squatCard).not.toBeNull();
    expect(
      within(squatCard as HTMLElement).queryByRole('button', { name: /Form Cues/i }),
    ).not.toBeInTheDocument();
    expect(
      within(squatCard as HTMLElement).queryByText('Injury-aware cues'),
    ).not.toBeInTheDocument();
  });

  it('collapses sections, toggles exercise details, and focuses the requested next set input', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set()),
    );

    const { rerender } = render(
      <SessionExerciseList
        focusSetId={createWorkoutSetId('row-erg', 1)}
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onFocusSetHandled={vi.fn()}
        onRestTimerComplete={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const rowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Row Erg' })
      .closest('[data-slot="card"]');
    expect(rowErgCard).not.toBeNull();

    const rowErgInput = within(rowErgCard as HTMLElement).getByLabelText('Reps for set 1');
    expect(rowErgInput).toHaveFocus();

    rerender(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onFocusSetHandled={vi.fn()}
        onRestTimerComplete={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const warmupButton = screen.getByRole('button', { name: /Warmup/i });
    fireEvent.click(warmupButton);
    expect(screen.queryByRole('heading', { level: 3, name: 'Row Erg' })).not.toBeInTheDocument();

    fireEvent.click(warmupButton);

    const exerciseButton = screen.getByRole('button', { name: /Row Erg/i });
    fireEvent.click(exerciseButton);

    const reopenedRowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Row Erg' })
      .closest('[data-slot="card"]');
    expect(reopenedRowErgCard).not.toBeNull();
    expect(
      within(reopenedRowErgCard as HTMLElement).getByLabelText('Weight for set 1'),
    ).not.toBeVisible();
  });
});
