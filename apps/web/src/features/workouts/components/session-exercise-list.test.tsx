import { QueryClientProvider } from '@tanstack/react-query';
import type { MouseEvent, ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';

import * as lastPerformanceHooks from '@/hooks/use-last-performance';
import { createAppQueryClient } from '@/lib/query-client';
import { mockTemplates } from '@/lib/mock-data/workouts';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import {
  buildActiveWorkoutSession,
  createInitialWorkoutSetDrafts,
  createWorkoutSetId,
} from '../lib/active-session';
import {
  getWorkoutExerciseStorageKey,
  getWorkoutSectionStorageKey,
} from '../lib/session-persistence';
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
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const activeTemplate = mockTemplates.find((template) => template.id === 'upper-push');
const lowerTemplate = mockTemplates.find((template) => template.id === 'lower-quad-dominant');

function getExercisePanelToggle(exerciseName: string, exerciseId: string) {
  const card = screen
    .getByRole('heading', { level: 3, name: exerciseName })
    .closest('[data-slot="card"]');

  if (!card) {
    throw new Error(`Expected ${exerciseName} card.`);
  }

  const toggle = within(card as HTMLElement)
    .getAllByRole('button')
    .find((button) => button.getAttribute('aria-controls') === `exercise-panel-${exerciseId}`);

  if (!toggle) {
    throw new Error(`Expected ${exerciseName} toggle button.`);
  }

  return toggle;
}

describe('SessionExerciseList', () => {
  it('renders prescribed set targets from session set data', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set()),
    );
    const inclinePress = session.sections
      .flatMap((section) => section.exercises)
      .find((exercise) => exercise.id === 'incline-dumbbell-press');
    const rowErg = session.sections
      .flatMap((section) => section.exercises)
      .find((exercise) => exercise.id === 'row-erg');
    const ropePushdown = session.sections
      .flatMap((section) => section.exercises)
      .find((exercise) => exercise.id === 'rope-triceps-pushdown');

    if (!inclinePress || !rowErg || !ropePushdown) {
      throw new Error('Expected template exercises in active workout session.');
    }

    const inclinePressSet = inclinePress.sets[0];
    const rowErgSet = rowErg.sets[0];
    const ropePushdownSet = ropePushdown.sets[0];

    if (!inclinePressSet || !rowErgSet || !ropePushdownSet) {
      throw new Error('Expected exercises with at least one set.');
    }

    inclinePressSet.targetWeightMin = 70;
    inclinePressSet.targetWeightMax = 90;
    rowErg.trackingType = 'seconds_only';
    rowErgSet.targetSeconds = 30;
    ropePushdown.trackingType = 'distance';
    ropePushdownSet.targetDistance = 40;

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    expect(screen.getByText('Target: 70-90 lbs')).toBeInTheDocument();
    expect(screen.getByText('Target: 30 sec')).toBeInTheDocument();
    expect(screen.getByText('Target: 40 mi')).toBeInTheDocument();
  });

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
        onSetUpdate={vi.fn()}
        session={session}
        weightUnit="kg"
      />,
    );

    const warmupButton = screen.getByRole('button', { name: /Warmup/i });
    const warmupBadge = within(warmupButton).getByText('2/2');
    expect(warmupBadge).toHaveClass('bg-emerald-500/15');
    expect(within(warmupBadge).getByText('Section complete')).toBeInTheDocument();

    const mainButton = screen.getByRole('button', { name: /Main/i });
    const mainBadge = within(mainButton).getByText('0/4');
    expect(mainBadge).toHaveClass('bg-muted');
    expect(screen.queryByText('2/2 exercises done')).not.toBeInTheDocument();
    expect(screen.queryByText('0/4 exercises done')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /Main \d+-\d+ min/i }),
    ).toBeInTheDocument();
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
    expect(
      within(currentCard as HTMLElement).getByLabelText('Weight for set 1'),
    ).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getByLabelText('Reps for set 3')).toBeInTheDocument();
    expect(
      within(currentCard as HTMLElement).getAllByRole('button', { name: 'Add Set' }).length,
    ).toBeGreaterThan(0);
    expect(
      within(currentCard as HTMLElement).getByText(/3 sets, 8-10 reps, 50 → 45 → 40 kg/i),
    ).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getByText('Tempo: 3-1-1-0')).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getAllByText('Rest: 90s').length).toBeGreaterThan(0);
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

    const optionalExercise = screen.getByRole('heading', {
      level: 3,
      name: 'Rope Triceps Pushdown',
    });
    const optionalCard = optionalExercise.closest('[data-slot="card"]');

    expect(optionalCard).not.toBeNull();
    expect(within(optionalCard as HTMLElement).getByText('Optional')).toBeInTheDocument();
  });

  it('applies distinct section badge styles for complete, partial, and zero-complete sections', () => {
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
          createWorkoutSetId('rope-triceps-pushdown', 1),
          createWorkoutSetId('rope-triceps-pushdown', 2),
          createWorkoutSetId('rope-triceps-pushdown', 3),
        ]),
      ),
    );

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const warmupBadge = within(screen.getByRole('button', { name: /Warmup/i })).getByText('2/2');
    expect(warmupBadge).toHaveClass('bg-emerald-500/15');
    expect(within(warmupBadge).getByText('Section complete')).toBeInTheDocument();

    const mainBadge = within(screen.getByRole('button', { name: /Main/i })).getByText('1/4');
    expect(mainBadge).toHaveClass('bg-secondary');
    expect(mainBadge).not.toHaveClass('bg-muted');

    const cooldownBadge = within(screen.getByRole('button', { name: /Cooldown/i })).getByText(
      '0/1',
    );
    expect(cooldownBadge).toHaveClass('bg-muted');
    expect(cooldownBadge).not.toHaveClass('bg-secondary');
  });

  it('debounces exercise notes updates until typing pauses', async () => {
    vi.useFakeTimers();

    try {
      if (!activeTemplate) {
        throw new Error('Expected upper-push template in mock data.');
      }

      const onExerciseNotesChange = vi.fn();
      const session = buildActiveWorkoutSession(
        activeTemplate,
        createInitialWorkoutSetDrafts(activeTemplate, new Set()),
      );

      renderWithQueryClient(
        <SessionExerciseList
          onAddSet={vi.fn()}
          onExerciseNotesChange={onExerciseNotesChange}
          onRemoveSet={vi.fn()}
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

      fireEvent.click(within(rowErgCard as HTMLElement).getByText('Session notes'));
      const notesInput = within(rowErgCard as HTMLElement).getByPlaceholderText(
        'Add any technique reminders, machine settings, or quick context.',
      );
      fireEvent.change(notesInput, { target: { value: 'Keep elbows stacked.' } });

      expect(notesInput).toHaveValue('Keep elbows stacked.');
      expect(onExerciseNotesChange).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(onExerciseNotesChange).toHaveBeenCalledWith('row-erg', 'Keep elbows stacked.');
      expect(onExerciseNotesChange).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes pending exercise notes update on blur', () => {
    vi.useFakeTimers();

    try {
      if (!activeTemplate) {
        throw new Error('Expected upper-push template in mock data.');
      }

      const onExerciseNotesChange = vi.fn();
      const session = buildActiveWorkoutSession(
        activeTemplate,
        createInitialWorkoutSetDrafts(activeTemplate, new Set()),
      );

      renderWithQueryClient(
        <SessionExerciseList
          onAddSet={vi.fn()}
          onExerciseNotesChange={onExerciseNotesChange}
          onRemoveSet={vi.fn()}
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

      fireEvent.click(within(rowErgCard as HTMLElement).getByText('Session notes'));
      const notesInput = within(rowErgCard as HTMLElement).getByPlaceholderText(
        'Add any technique reminders, machine settings, or quick context.',
      );
      fireEvent.change(notesInput, { target: { value: 'Slight pause at extension.' } });

      expect(onExerciseNotesChange).not.toHaveBeenCalled();

      fireEvent.blur(notesInput);

      expect(onExerciseNotesChange).toHaveBeenCalledWith('row-erg', 'Slight pause at extension.');
      expect(onExerciseNotesChange).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
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

  it('opens rename dialog from the exercise actions menu', async () => {
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

    fireEvent.click(
      within(rowErgCard as HTMLElement).getByRole('button', { name: 'Rename exercise' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Exercise name')).toHaveValue('Row Erg');
    expect(within(dialog).getByRole('button', { name: 'Rename' })).toBeDisabled();
  });

  it('opens swap dialog from the exercise actions menu and calls session swap endpoint', async () => {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/exercises') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'row-erg',
                userId: 'user-1',
                name: 'Row Erg',
                muscleGroups: ['back'],
                equipment: 'Erg',
                category: 'cardio',
                trackingType: 'seconds_only',
                tags: [],
                formCues: [],
                instructions: null,
                coachingNotes: null,
                relatedExerciseIds: ['assault-bike'],
                createdAt: 1,
                updatedAt: 1,
              },
              {
                id: 'assault-bike',
                userId: 'user-1',
                name: 'Assault Bike',
                muscleGroups: ['legs', 'cardio'],
                equipment: 'Bike',
                category: 'cardio',
                trackingType: 'seconds_only',
                tags: [],
                formCues: [],
                instructions: null,
                coachingNotes: null,
                relatedExerciseIds: [],
                createdAt: 1,
                updatedAt: 1,
              },
            ],
            meta: {
              page: 1,
              limit: 100,
              total: 2,
            },
          }),
        );
      }

      if (
        url.pathname === '/api/v1/workout-sessions/session-1/exercises/row-erg/swap' &&
        init?.method === 'PATCH'
      ) {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'session-1',
              userId: 'user-1',
              templateId: 'template-1',
              name: 'Upper Push',
              date: '2026-03-06',
              status: 'in-progress',
              startedAt: 1,
              completedAt: null,
              duration: null,
              timeSegments: [
                {
                  start: '2026-03-06T00:00:00.000Z',
                  end: null,
                },
              ],
              feedback: null,
              notes: null,
              exercises: [
                {
                  exerciseId: 'assault-bike',
                  exerciseName: 'Assault Bike',
                  trackingType: 'seconds_only',
                  orderIndex: 0,
                  section: 'warmup',
                  sets: [
                    {
                      id: 'set-1',
                      exerciseId: 'assault-bike',
                      setNumber: 1,
                      weight: null,
                      reps: 30,
                      completed: false,
                      skipped: false,
                      section: 'warmup',
                      notes: null,
                      createdAt: 1,
                    },
                  ],
                },
              ],
              sets: [
                {
                  id: 'set-1',
                  exerciseId: 'assault-bike',
                  setNumber: 1,
                  weight: null,
                  reps: 30,
                  completed: false,
                  skipped: false,
                  section: 'warmup',
                  notes: null,
                  createdAt: 1,
                },
              ],
              createdAt: 1,
              updatedAt: 1,
            },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${String(input)}`));
    });

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
        onSetUpdate={vi.fn()}
        session={session}
        sessionId="session-1"
      />,
    );

    const rowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Row Erg' })
      .closest('[data-slot="card"]');

    if (!rowErgCard) {
      throw new Error('Expected Row Erg card.');
    }

    fireEvent.click(
      within(rowErgCard as HTMLElement).getByRole('button', { name: 'Swap exercise' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Related exercises')).toBeInTheDocument();
    fireEvent.click(await within(dialog).findByRole('button', { name: /Assault Bike/i }));

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([input, init]) =>
            String(input).includes('/api/v1/workout-sessions/session-1/exercises/row-erg/swap') &&
            init?.method === 'PATCH',
        ),
      ).toBe(true);
    });
    window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  });

  it('shows move up/down actions and calls onReorderExercises for active workout lists', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const onReorderExercises = vi.fn();
    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set()),
    );

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onReorderExercises={onReorderExercises}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const rowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Row Erg' })
      .closest('[data-slot="card"]');
    expect(rowErgCard).not.toBeNull();

    fireEvent.click(
      within(rowErgCard as HTMLElement).getByRole('button', {
        name: 'Exercise actions for Row Erg',
      }),
    );
    expect(
      within(rowErgCard as HTMLElement).getByRole('button', { name: 'Move up' }),
    ).toBeDisabled();
    fireEvent.click(within(rowErgCard as HTMLElement).getByRole('button', { name: 'Move down' }));

    expect(onReorderExercises).toHaveBeenCalledWith('warmup', [
      'banded-shoulder-external-rotation',
      'row-erg',
    ]);
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
    expect(within(squatCard as HTMLElement).getByText(/4 sets × 5-6 reps/i)).toBeInTheDocument();
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
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const superset = screen.getByLabelText('Superset Pump A');
    expect(superset).toBeInTheDocument();
  });

  it('collapses superset exercises independently', () => {
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
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Main/i }));
    fireEvent.click(getExercisePanelToggle('Cable Lateral Raise', 'cable-lateral-raise'));

    expect(document.getElementById('exercise-panel-cable-lateral-raise')).toHaveAttribute('hidden');
    expect(document.getElementById('exercise-panel-rope-triceps-pushdown')).not.toHaveAttribute(
      'hidden',
    );
  });

  it('supports grouping and ungrouping supersets from workout sections', async () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const onUpdateSupersetGroup = vi.fn();
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
        onSetUpdate={vi.fn()}
        onUpdateSupersetGroup={onUpdateSupersetGroup}
        session={session}
      />,
    );

    const rowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Row Erg' })
      .closest('[data-slot="card"]');
    if (!rowErgCard) throw new Error('Expected Row Erg card.');

    fireEvent.click(
      within(rowErgCard as HTMLElement).getByRole('button', { name: 'Configure superset' }),
    );

    const dialog = await screen.findByRole('dialog');
    // Row Erg should already be pre-selected from the menu trigger
    fireEvent.click(within(dialog).getByText('2. Banded Shoulder External Rotation'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Group as Superset' }));

    expect(onUpdateSupersetGroup).toHaveBeenCalledWith(
      'warmup',
      ['row-erg', 'banded-shoulder-external-rotation'],
      'superset-a',
    );

    fireEvent.click(screen.getByRole('button', { name: /Main/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Ungroup' }));
    expect(onUpdateSupersetGroup).toHaveBeenCalledWith(
      'main',
      ['cable-lateral-raise', 'rope-triceps-pushdown'],
      null,
    );
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

  it('keeps non-current completed exercises expanded by default', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const drafts = createInitialWorkoutSetDrafts(activeTemplate, new Set());
    drafts['banded-shoulder-external-rotation'] = drafts['banded-shoulder-external-rotation'].map(
      (set) => ({
        ...set,
        completed: true,
        reps: 15,
      }),
    );

    const session = buildActiveWorkoutSession(activeTemplate, drafts, {
      sessionStartedAt: '2026-03-06T12:00:00Z',
    });

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const bandedCard = screen
      .getByRole('heading', { level: 3, name: 'Banded Shoulder External Rotation' })
      .closest('[data-slot="card"]');

    expect(bandedCard).not.toBeNull();
    expect(within(bandedCard as HTMLElement).getByLabelText('Reps for set 1')).toBeInTheDocument();
    expect(
      within(bandedCard as HTMLElement).getByRole('heading', {
        level: 3,
        name: 'Banded Shoulder External Rotation',
      }),
    ).toHaveClass('line-through');
  });

  it('keeps section open state manual when workout progress moves into the next section', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const initialSession = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set()),
    );
    const progressedSession = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(
        activeTemplate,
        new Set([
          createWorkoutSetId('row-erg', 1),
          createWorkoutSetId('banded-shoulder-external-rotation', 1),
          createWorkoutSetId('banded-shoulder-external-rotation', 2),
        ]),
      ),
    );

    const queryClient = createAppQueryClient();
    queryClient.clear();

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <SessionExerciseList
          onAddSet={vi.fn()}
          onExerciseNotesChange={vi.fn()}
          onRemoveSet={vi.fn()}
          onSetUpdate={vi.fn()}
          session={initialSession}
        />
      </QueryClientProvider>,
    );

    const warmupButton = screen.getByRole('button', { name: /Warmup/i });
    const mainButton = screen.getByRole('button', { name: /Main/i });

    if (warmupButton.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(warmupButton);
    }
    if (mainButton.getAttribute('aria-expanded') === 'true') {
      fireEvent.click(mainButton);
    }

    expect(warmupButton).toHaveAttribute('aria-expanded', 'true');
    expect(mainButton).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionExerciseList
          onAddSet={vi.fn()}
          onExerciseNotesChange={vi.fn()}
          onRemoveSet={vi.fn()}
          onSetUpdate={vi.fn()}
          session={progressedSession}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: /Warmup/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: /Main/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('persists section and exercise collapse state across remounts for the same session id', () => {
    vi.useFakeTimers();

    try {
      if (!activeTemplate) {
        throw new Error('Expected upper-push template in mock data.');
      }

      const session = buildActiveWorkoutSession(
        activeTemplate,
        createInitialWorkoutSetDrafts(activeTemplate, new Set()),
      );
      const sectionKey = getWorkoutSectionStorageKey('session-persist-a');
      const exerciseKey = getWorkoutExerciseStorageKey('session-persist-a');

      if (!sectionKey || !exerciseKey) {
        throw new Error('Expected workout storage keys.');
      }

      const firstRender = renderWithQueryClient(
        <SessionExerciseList
          onAddSet={vi.fn()}
          onExerciseNotesChange={vi.fn()}
          onRemoveSet={vi.fn()}
          onSetUpdate={vi.fn()}
          session={session}
          sessionId="session-persist-a"
        />,
      );

      fireEvent.click(getExercisePanelToggle('Row Erg', 'row-erg'));
      fireEvent.click(screen.getByRole('button', { name: /Warmup/i }));
      act(() => {
        vi.advanceTimersByTime(200);
      });
      firstRender.unmount();

      const storedSections = window.localStorage.getItem(sectionKey);
      const storedExercises = window.localStorage.getItem(exerciseKey);

      expect(storedSections).not.toBeNull();
      expect(storedExercises).not.toBeNull();
      expect(JSON.parse(storedSections ?? '{}')).toMatchObject({ warmup: false });
      expect(JSON.parse(storedExercises ?? '{}')).toMatchObject({ 'row-erg': false });

      renderWithQueryClient(
        <SessionExerciseList
          onAddSet={vi.fn()}
          onExerciseNotesChange={vi.fn()}
          onRemoveSet={vi.fn()}
          onSetUpdate={vi.fn()}
          session={session}
          sessionId="session-persist-a"
        />,
      );

      const warmupButton = screen.getByRole('button', { name: /Warmup/i });
      expect(warmupButton).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(warmupButton);

      expect(getExercisePanelToggle('Row Erg', 'row-erg')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('scopes persisted section state by session id', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set()),
    );

    const firstRender = renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
        sessionId="session-scope-a"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Warmup/i }));
    firstRender.unmount();

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
        sessionId="session-scope-b"
      />,
    );

    expect(screen.getByRole('button', { name: /Warmup/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
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

    const rowErgSecondsInput = within(reopenedRowErgCard as HTMLElement).getByLabelText(
      'Seconds for set 1',
    );
    expect(rowErgSecondsInput).toBeVisible();

    fireEvent.click(reopenedRowErgCardHeaderToggle);
    expect(rowErgSecondsInput).not.toBeVisible();
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
              prescribedSets: 3,
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
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const card = screen
      .getByRole('heading', { level: 3, name: 'Tempo Squat' })
      .closest('[data-slot="card"]');
    expect(card).not.toBeNull();
    expect(
      within(card as HTMLElement).getByText(/3 × 10 reps \+ 30 sec hold/i),
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
              prescribedSets: 3,
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
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const rowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Plank Hold' })
      .closest('[data-slot="card"]');
    expect(rowErgCard).not.toBeNull();
    expect(within(rowErgCard as HTMLElement).getByText(/3 × 30 sec/i)).toBeInTheDocument();
  });

  it('renders bodyweight reps exercises without a weight input', () => {
    const session: ActiveWorkoutSessionData = {
      completedSets: 0,
      currentExercise: 1,
      currentExerciseId: 'pull-up',
      sections: [
        {
          exercises: [
            {
              badges: ['compound'],
              category: 'compound',
              completedSets: 0,
              formCues: [],
              id: 'pull-up',
              injuryCues: [],
              lastPerformance: null,
              name: 'Pull-up',
              notes: '',
              phaseBadge: 'moderate',
              prescribedSets: 3,
              prescribedReps: '6-8',
              priority: 'required',
              restSeconds: 90,
              reversePyramid: [],
              sets: [
                {
                  completed: false,
                  distance: null,
                  id: 'pull-up-set-1',
                  number: 1,
                  reps: null,
                  seconds: null,
                  weight: null,
                },
              ],
              supersetGroup: null,
              templateCues: [],
              tempo: null,
              targetSets: 1,
              trackingType: 'bodyweight_reps',
            },
          ],
          id: 'main',
          title: 'Main',
          type: 'main',
        },
      ],
      totalExercises: 1,
      totalSets: 1,
      workoutName: 'Bodyweight Session',
    };

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const card = screen
      .getByRole('heading', { level: 3, name: 'Pull-up' })
      .closest('[data-slot="card"]');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByLabelText('Reps for set 1')).toBeInTheDocument();
    expect(
      within(card as HTMLElement).queryByLabelText('Weight for set 1'),
    ).not.toBeInTheDocument();
  });

  it('shows all sets in the inline history preview for the latest session', () => {
    const session: ActiveWorkoutSessionData = {
      completedSets: 0,
      currentExercise: 1,
      currentExerciseId: 'incline-dumbbell-press',
      sections: [
        {
          exercises: [
            {
              badges: ['compound'],
              category: 'compound',
              completedSets: 0,
              formCues: [],
              id: 'incline-dumbbell-press',
              injuryCues: [],
              lastPerformance: {
                date: '2026-03-13',
                sessionId: 'session-last',
                sets: [
                  { completed: true, reps: 12, setNumber: 1, weight: 25 },
                  { completed: true, reps: 12, setNumber: 2, weight: 25 },
                ],
              },
              name: 'Incline Dumbbell Press',
              notes: '',
              phaseBadge: 'moderate',
              prescribedSets: 2,
              prescribedReps: '10-12',
              priority: 'required',
              restSeconds: 90,
              reversePyramid: [],
              sets: [
                {
                  completed: false,
                  distance: null,
                  id: 'incline-set-1',
                  number: 1,
                  reps: null,
                  seconds: null,
                  weight: null,
                },
              ],
              supersetGroup: null,
              templateCues: [],
              tempo: null,
              targetSets: 1,
              trackingType: 'weight_reps',
            },
          ],
          id: 'main',
          title: 'Main',
          type: 'main',
        },
      ],
      totalExercises: 1,
      totalSets: 1,
      workoutName: 'History Preview Session',
    };

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const card = screen
      .getByRole('heading', { level: 3, name: 'Incline Dumbbell Press' })
      .closest('[data-slot="card"]');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText(/Mar 13 - 25x12, 25x12/)).toBeInTheDocument();
  });

  it('opens and closes full history modal from active workout exercise rows', async () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/exercises/row-erg/history') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                sessionId: 'session-1',
                date: '2026-03-17',
                notes: null,
                sets: [
                  { setNumber: 1, reps: 15, weight: 25 },
                  { setNumber: 2, reps: 12, weight: 25 },
                ],
              },
            ],
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set()),
    );

    renderWithQueryClient(
      <SessionExerciseList
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    // "View all" button is inside the expanded exercise card's history section
    const rowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Row Erg' })
      .closest('[data-slot="card"]');
    if (!rowErgCard) throw new Error('Expected Row Erg card.');

    fireEvent.click(within(rowErgCard as HTMLElement).getByRole('button', { name: 'View all' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Row Erg history')).toBeInTheDocument();

    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0] as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByText('Row Erg history')).not.toBeInTheDocument();
    });
  });

  it('renders related history collapsed by default and expands on demand', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const useLastPerformanceSpy = vi.spyOn(lastPerformanceHooks, 'useLastPerformance');
    useLastPerformanceSpy.mockReturnValue({
      data: {
        history: {
          date: '2026-03-12',
          sessionId: 'session-10',
          sets: [{ completed: true, reps: 10, setNumber: 1, weight: 55 }],
        },
        related: [
          {
            exerciseId: 'incline-bench',
            exerciseName: 'Incline Bench Press',
            trackingType: 'weight_reps',
            history: {
              date: '2026-03-08',
              sessionId: 'session-8',
              sets: [{ completed: true, reps: 8, setNumber: 1, weight: 60 }],
            },
          },
        ],
      },
    } as unknown as ReturnType<typeof lastPerformanceHooks.useLastPerformance>);

    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set()),
    );

    renderWithQueryClient(
      <SessionExerciseList
        enableApiLastPerformance
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const rowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Row Erg' })
      .closest('[data-slot="card"]');
    expect(rowErgCard).not.toBeNull();
    expect(within(rowErgCard as HTMLElement).getByText('History')).toBeInTheDocument();
    expect(within(rowErgCard as HTMLElement).getByText('Related history')).toBeInTheDocument();
    expect(within(rowErgCard as HTMLElement).getByText('Incline Bench Press')).not.toBeVisible();

    fireEvent.click(within(rowErgCard as HTMLElement).getByText('Related history'));
    const relatedExerciseLabel = within(rowErgCard as HTMLElement).getByText('Incline Bench Press');
    expect(relatedExerciseLabel).toBeVisible();
    expect(relatedExerciseLabel.closest('div')).toHaveTextContent(/60x8/);

    useLastPerformanceSpy.mockRestore();
  });

  it('hides related history section when no related exercises are configured', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const useLastPerformanceSpy = vi.spyOn(lastPerformanceHooks, 'useLastPerformance');
    useLastPerformanceSpy.mockReturnValue({
      data: {
        history: null,
        related: [],
      },
    } as unknown as ReturnType<typeof lastPerformanceHooks.useLastPerformance>);

    const session = buildActiveWorkoutSession(
      activeTemplate,
      createInitialWorkoutSetDrafts(activeTemplate, new Set()),
    );

    renderWithQueryClient(
      <SessionExerciseList
        enableApiLastPerformance
        onAddSet={vi.fn()}
        onExerciseNotesChange={vi.fn()}
        onRemoveSet={vi.fn()}
        onSetUpdate={vi.fn()}
        session={session}
      />,
    );

    const rowErgCard = screen
      .getByRole('heading', { level: 3, name: 'Row Erg' })
      .closest('[data-slot="card"]');
    expect(rowErgCard).not.toBeNull();
    expect(within(rowErgCard as HTMLElement).getByText('History')).toBeInTheDocument();
    expect(
      within(rowErgCard as HTMLElement).queryByText('Related history'),
    ).not.toBeInTheDocument();

    useLastPerformanceSpy.mockRestore();
  });
});
