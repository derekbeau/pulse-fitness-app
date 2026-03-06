import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { mockTemplates } from '@/lib/mock-data/workouts';

import { buildActiveWorkoutSession, createInitialWorkoutSetDrafts, createWorkoutSetId } from '../lib/active-session';
import { SessionExerciseList } from './session-exercise-list';

const activeTemplate = mockTemplates.find((template) => template.id === 'upper-push');

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

    const currentExercise = screen.getByRole('heading', {
      level: 3,
      name: 'Incline Dumbbell Press',
    });
    const currentCard = currentExercise.closest('[data-slot="card"]');

    expect(currentCard).not.toBeNull();
    expect(within(currentCard as HTMLElement).getByText('Current')).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getByLabelText('Weight for set 1')).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getByLabelText('Reps for set 3')).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getByRole('button', { name: 'Add Set' })).toBeInTheDocument();
    expect(
      within(currentCard as HTMLElement).getByText(/Last time .*24 x 10 reps • 24 x 9 reps • 24 x 8 reps/i),
    ).toBeInTheDocument();

    fireEvent.click(within(currentCard as HTMLElement).getByRole('button', { name: 'Form cues' }));
    expect(within(currentCard as HTMLElement).getByText('Drive feet into the floor')).toBeVisible();
    expect(within(currentCard as HTMLElement).getByText('Keep wrists stacked over elbows')).toBeVisible();

    const notesInput = within(currentCard as HTMLElement).getByLabelText('Session notes');
    expect(notesInput).toHaveValue('Bench one notch lower than usual.');
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

    const rowErgCard = screen.getByRole('heading', { level: 3, name: 'Row Erg' }).closest('[data-slot="card"]');
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
    expect(within(reopenedRowErgCard as HTMLElement).getByLabelText('Weight for set 1')).not.toBeVisible();
  });
});
