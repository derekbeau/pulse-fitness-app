import { QueryClientProvider } from '@tanstack/react-query';
import type { MouseEvent, ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createAppQueryClient } from '@/lib/query-client';
import { mockTemplates } from '@/lib/mock-data/workouts';
import { renderWithQueryClient } from '@/test/render-with-query-client';

import {
  buildActiveWorkoutSession,
  createInitialWorkoutSetDrafts,
  createWorkoutSetId,
} from '../lib/active-session';
import type { ActiveWorkoutSessionData } from '../types';
import { SessionExerciseList } from './session-exercise-list';

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const activeTemplate = mockTemplates.find((template) => template.id === 'upper-push');
const lowerTemplate = mockTemplates.find((template) => template.id === 'lower-quad-dominant');

describe('SessionExerciseList', () => {
  it('shows editable set rows and renders an inline rest timer after the completed set', () => {
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

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onRestTimerComplete={vi.fn()}
        onSetUpdate={vi.fn()}
        restTimer={{
          duration: 90,
          exerciseId: 'incline-dumbbell-press',
          exerciseName: 'Incline Dumbbell Press',
          setId: createWorkoutSetId('incline-dumbbell-press', 2),
          setNumber: 2,
          token: 1,
        }}
        session={session}
        weightUnit="kg"
      />,
    );

    expect(screen.getByText('Warmup (2/2 exercises done)')).toBeInTheDocument();
    expect(screen.getByText('Main (0/4 exercises done)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Main — ~\d+ min/i })).toBeInTheDocument();
    expect(screen.getByText('After Incline Dumbbell Press set 2')).toBeInTheDocument();
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
      within(currentCard as HTMLElement).getAllByRole('button', { name: 'Add Set' }).length,
    ).toBeGreaterThan(0);
    expect(
      within(currentCard as HTMLElement).getByText(/3 × 8-10 \| 50\.0 → 45\.0 → 40\.0 kg/i),
    ).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getByText('Tempo: 3-1-1-0')).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getByText('Rest: 1:30')).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getByText('~5 min')).toBeInTheDocument();
    expect(
      within(currentCard as HTMLElement).getByText(/Last: 50\.0x12, 45\.0x10, 40\.0x9/i),
    ).toBeInTheDocument();
    expect(
      within(currentCard as HTMLElement).getByTestId('set-grid-incline-dumbbell-press'),
    ).toHaveClass('grid-cols-2');

    expect(within(currentCard as HTMLElement).getByText('Exercise cues')).toBeVisible();
    expect(within(currentCard as HTMLElement).getByText('Drive feet into the floor')).toBeVisible();
    expect(
      within(currentCard as HTMLElement).getByText('Keep wrists stacked over elbows'),
    ).toBeVisible();
    expect(within(currentCard as HTMLElement).getByText('Form cues')).toBeVisible();
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

  it('opens exercise menu actions and disables remove when only one set remains', async () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const onAddSet = vi.fn();
    const onRemoveSet = vi.fn();
    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set()),
    );

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={onAddSet}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={onRemoveSet}
        onRestTimerComplete={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const rowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Row Erg' })
      .closest('[data-slot="card"]');

    if (!rowErgCard) {
      throw new Error('Expected Row Erg card.');
    }

    const rowErgCardElement = rowErgCard as HTMLElement;
    const addSetItem = within(rowErgCardElement).getAllByRole('button', { name: 'Add Set' })[0];
    fireEvent.click(addSetItem);
    expect(onAddSet).toHaveBeenCalledWith('row-erg');

    expect(
      within(rowErgCardElement).getByRole('button', { name: 'Remove Last Set' }),
    ).toBeDisabled();
    expect(onRemoveSet).not.toHaveBeenCalled();
  });

  it('allows adding a session-specific cue from the exercise card', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set()),
    );

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onRestTimerComplete={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const currentCard = screen
      .getByRole('heading', { level: 3, name: 'Row Erg' })
      .closest('[data-slot="card"]');

    expect(currentCard).not.toBeNull();
    fireEvent.click(within(currentCard as HTMLElement).getByRole('button', { name: 'Add session cue' }));
    fireEvent.change(within(currentCard as HTMLElement).getByLabelText('Session cue input'), {
      target: { value: 'Keep elbows soft at lockout' },
    });
    fireEvent.click(within(currentCard as HTMLElement).getByRole('button', { name: 'Add' }));
    expect(
      within(currentCard as HTMLElement).getByText('Keep elbows soft at lockout'),
    ).toBeInTheDocument();
  });

  it('still renders template form cues and omits injury warnings when enhanced injury data is unavailable', () => {
    if (!lowerTemplate) {
      throw new Error('Expected lower-quad-dominant template in mock data.');
    }

    const session = buildActiveWorkoutSession(
      lowerTemplate,
      createInitialWorkoutSetDrafts(lowerTemplate, new Set()),
    );

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
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
    expect(within(squatCard as HTMLElement).getByText('Form cues')).toBeInTheDocument();
    expect(
      within(squatCard as HTMLElement).queryByText('Injury-aware cues'),
    ).not.toBeInTheDocument();
    expect(within(squatCard as HTMLElement).getByText(/4 × 5-6/i)).toBeInTheDocument();
  });

  it('renders superset rest timers between exercises in the superset group', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set()),
      {
        sessionStartedAt: '2026-03-06T12:00:00Z',
      },
    );

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onRestTimerComplete={vi.fn()}
        onSetUpdate={vi.fn()}
        restTimer={{
          duration: 60,
          exerciseId: 'cable-lateral-raise',
          exerciseName: 'Cable Lateral Raise',
          setId: createWorkoutSetId('cable-lateral-raise', 1),
          setNumber: 1,
          token: 2,
        }}
        session={session}
      />,
    );

    const superset = screen.getByLabelText('Superset Pump A');
    expect(within(superset).getByText('After Cable Lateral Raise set 1')).toBeInTheDocument();
  });

  it('shows completed exercises with strike-through treatment', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const drafts = createInitialWorkoutSetDrafts(activeTemplate, new Set());
    drafts['incline-dumbbell-press'] = drafts['incline-dumbbell-press'].map((set, index) => ({
      ...set,
      completed: true,
      reps: 13 - index,
      weight: 50 - index * 5,
    }));

    const session = buildActiveWorkoutSession(activeTemplate, drafts, {
      sessionStartedAt: '2026-03-06T12:00:00Z',
    });

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onRestTimerComplete={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Main/i }));

    const currentCard = screen
      .getByRole('heading', { level: 3, name: 'Incline Dumbbell Press' })
      .closest('[data-slot="card"]');

    expect(currentCard).not.toBeNull();
    expect(
      within(currentCard as HTMLElement).getByRole('heading', {
        level: 3,
        name: 'Incline Dumbbell Press',
      }),
    ).toHaveClass('line-through');
  });

  it('collapses sections, toggles exercise details, and focuses the requested next set input', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set()),
    );

    const queryClient = createAppQueryClient();
    queryClient.clear();

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <SessionExerciseList
          focusSetId={createWorkoutSetId('row-erg', 1)}
          onAddSet={vi.fn()}
          onExerciseNotesChange={vi.fn()}
          onFocusSetHandled={vi.fn()}
          onRemoveSet={vi.fn()}
          onRestTimerComplete={vi.fn()}
          onSetUpdate={vi.fn()}
          session={session}
        />
      </QueryClientProvider>,
    );

    const rowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Row Erg' })
      .closest('[data-slot="card"]');
    expect(rowErgCard).not.toBeNull();

    const rowErgInput = within(rowErgCard as HTMLElement).getByLabelText('Seconds for set 1');
    expect(rowErgInput).toHaveFocus();

    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionExerciseList
          onAddSet={vi.fn()}
          onExerciseNotesChange={vi.fn()}
          onFocusSetHandled={vi.fn()}
          onRemoveSet={vi.fn()}
          onRestTimerComplete={vi.fn()}
          onSetUpdate={vi.fn()}
          session={session}
        />
      </QueryClientProvider>,
    );

    const warmupButton = screen.getByRole('button', { name: /Warmup/i });
    fireEvent.click(warmupButton);
    expect(screen.queryByRole('heading', { level: 3, name: 'Row Erg' })).not.toBeInTheDocument();

    fireEvent.click(warmupButton);

    const reopenedRowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Row Erg' })
      .closest('[data-slot="card"]');
    expect(reopenedRowErgCard).not.toBeNull();

    const reopenedRowErgCardHeaderToggle = within(reopenedRowErgCard as HTMLElement)
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-controls') === 'exercise-panel-row-erg');

    if (!reopenedRowErgCardHeaderToggle) {
      throw new Error('Expected Row Erg exercise header toggle.');
    }

    fireEvent.click(reopenedRowErgCardHeaderToggle);
    expect(
      within(reopenedRowErgCard as HTMLElement).queryByLabelText('Weight for set 1'),
    ).not.toBeInTheDocument();
  });

  it('formats reps-seconds last performance as reps when seconds are unavailable in history', () => {
    const session: ActiveWorkoutSessionData = {
      completedSets: 0,
      currentExercise: 1,
      currentExerciseId: 'tempo-squat',
      sections: [
        {
          exercises: [
            {
              badges: ['compound'],
              category: 'compound',
              completedSets: 0,
              formCues: [],
              id: 'tempo-squat',
              injuryCues: [],
              lastPerformance: {
                date: '2026-03-02',
                sessionId: 'session-1',
                sets: [{ completed: true, reps: 10, setNumber: 1, weight: null }],
              },
              name: 'Tempo Squat',
              notes: '',
              phaseBadge: 'moderate',
              prescribedReps: '10 reps + 30 sec hold',
              priority: 'required',
              restSeconds: 90,
              reversePyramid: [],
              sets: [
                {
                  completed: false,
                  distance: null,
                  id: 'tempo-squat-set-1',
                  number: 1,
                  reps: 10,
                  seconds: 30,
                  weight: null,
                },
              ],
              supersetGroup: null,
              templateCues: [],
              tempo: null,
              targetSets: 1,
              trackingType: 'reps_seconds',
            },
          ],
          id: 'main',
          title: 'Main',
          type: 'main',
        },
      ],
      totalExercises: 1,
      totalSets: 1,
      workoutName: 'Custom Session',
    };

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onRestTimerComplete={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const card = screen
      .getByRole('heading', { level: 3, name: 'Tempo Squat' })
      .closest('[data-slot="card"]');
    expect(card).not.toBeNull();
    expect(
      within(card as HTMLElement).getByText(/1 × 10 reps \+ 30 sec hold • Last: 10 reps/i),
    ).toBeInTheDocument();
    expect(
      within(card as HTMLElement).queryByText(
        (_, element) => element?.textContent === '10 x 10 sec',
      ),
    ).not.toBeInTheDocument();
  });

  it('renders a compact subtitle for time-based exercises', () => {
    const session: ActiveWorkoutSessionData = {
      completedSets: 1,
      currentExercise: 1,
      currentExerciseId: 'plank-hold',
      sections: [
        {
          exercises: [
            {
              badges: ['mobility'],
              category: 'mobility',
              completedSets: 1,
              formCues: [],
              id: 'plank-hold',
              injuryCues: [],
              lastPerformance: {
                date: '2026-03-02',
                sessionId: 'session-1',
                sets: [{ completed: true, reps: 30, setNumber: 1, weight: null }],
              },
              name: 'Plank Hold',
              notes: '',
              phaseBadge: 'recovery',
              prescribedReps: '30 sec',
              priority: 'required',
              restSeconds: 60,
              reversePyramid: [],
              sets: [
                {
                  completed: true,
                  distance: null,
                  id: 'plank-hold-set-1',
                  number: 1,
                  reps: null,
                  seconds: 45,
                  weight: null,
                },
              ],
              supersetGroup: null,
              templateCues: [],
              tempo: null,
              targetSets: 1,
              trackingType: 'seconds_only',
            },
          ],
          id: 'main',
          title: 'Main',
          type: 'main',
        },
      ],
      totalExercises: 1,
      totalSets: 1,
      workoutName: 'Custom Session',
    };

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onRestTimerComplete={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const rowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Plank Hold' })
      .closest('[data-slot="card"]');
    expect(rowErgCard).not.toBeNull();
    expect(within(rowErgCard as HTMLElement).getByText(/1 × 30 sec/i)).toBeInTheDocument();
    expect(within(rowErgCard as HTMLElement).getByText(/Last: 30 sec/i)).toBeInTheDocument();
  });
});
