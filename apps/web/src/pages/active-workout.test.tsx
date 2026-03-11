import { act, fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';
import {
  buildSessionSetInputs,
  extractExerciseNotes,
} from '@/features/workouts/lib/session-notes';

import { ActiveWorkoutPage } from './active-workout';

describe('ActiveWorkoutPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00.000Z'));
    vi.stubEnv('VITE_PULSE_DEV_USERNAME', 'dev-user');
    vi.stubEnv('VITE_PULSE_DEV_PASSWORD', 'dev-pass');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/api/v1/auth/register')) {
          return Promise.resolve(jsonResponse({ data: { token: 'dev-generated-token' } }));
        }

        if (url.endsWith('/api/v1/workout-sessions') && init?.method === 'POST') {
          return Promise.resolve(jsonResponse({ data: buildCompletedSessionResponse() }));
        }

        if (url.includes('/api/v1/workout-sessions/') && init?.method === 'PATCH') {
          return Promise.resolve(jsonResponse({ data: null }));
        }

        return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
    const draftKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith('pulse.active-workout-draft:')) {
        draftKeys.push(key);
      }
    }
    for (const key of draftKeys) {
      window.localStorage.removeItem(key);
    }
  });

  it('renders the active workout UI and advances focus after the rest timer completes', () => {
    renderActiveWorkoutPage();

    const heading = screen.getByRole('heading', { level: 1, name: 'Upper Push' });
    const headerCard = heading.closest('[data-slot="card"]');
    const progressBar = screen.getByRole('progressbar', { name: 'Workout progress' });
    const stickyProgressStrip = progressBar.closest('.sticky');

    expect(headerCard).not.toHaveClass('sticky');
    expect(stickyProgressStrip).toHaveClass('sticky', 'top-0', 'z-20');
    expect(screen.getByText('Exercise 3 of 7')).toBeInTheDocument();
    expect(screen.getByText(/~\d+ min total estimate/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Session context' })).toBeInTheDocument();
    expect(screen.getByText('Recent Training')).toBeInTheDocument();
    expect(screen.getByText('Recovery Status')).toBeInTheDocument();
    expect(screen.getByText('Active Injuries')).toBeInTheDocument();
    expect(screen.getByText('Training Phase')).toBeInTheDocument();
    expect(screen.getByText('Warmup (2/2 exercises done)')).toBeInTheDocument();
    expect(screen.getByText('Superset')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Post-Workout Supplemental \(10-20 min\)/i }),
    ).toBeInTheDocument();

    const inclineCard = getExerciseCard('Incline Dumbbell Press');
    expect(within(inclineCard).getByText('Moderate')).toBeInTheDocument();

    fireEvent.change(within(inclineCard).getByLabelText('Weight for set 3'), {
      target: { value: '40' },
    });
    fireEvent.change(within(inclineCard).getByLabelText('Reps for set 3'), {
      target: { value: '9' },
    });

    expect(screen.getByText('After Incline Dumbbell Press set 3')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(90_100);
    });

    const nextExerciseCard = getExerciseCard('Seated Dumbbell Shoulder Press');
    expect(within(nextExerciseCard).getByLabelText('Reps for set 1')).toHaveFocus();
    expect(screen.queryByText('After Incline Dumbbell Press set 3')).not.toBeInTheDocument();

    const optionalCard = getExerciseCard('Rope Triceps Pushdown');
    expect(within(optionalCard).getByText('Optional')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Post-Workout Supplemental/i }));
    expect(screen.getByText('Core & Spine Health (pick at least 2)')).toBeInTheDocument();
    expect(screen.getByText('Dead Bug Breathing')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Optional' })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Complete supplemental exercise Dead Bug Breathing',
      }),
    );
    expect(
      screen.getByRole('checkbox', {
        name: 'Complete supplemental exercise Dead Bug Breathing',
      }),
    ).toBeChecked();
  });

  it('moves from session logging to feedback, summary, and back to workouts', async () => {
    vi.useRealTimers();
    renderActiveWorkoutPage();

    const inclineCard = getExerciseCard('Incline Dumbbell Press');

    fireEvent.click(within(inclineCard).getByRole('button', { name: /Notes/i }));
    fireEvent.change(within(inclineCard).getByLabelText('Session notes'), {
      target: { value: 'Lower the bench by one notch before the top set.' },
    });
    expect(
      within(inclineCard).getByDisplayValue('Lower the bench by one notch before the top set.'),
    ).toBeVisible();

    completeSet('Incline Dumbbell Press', 3);
    completeSet('Seated Dumbbell Shoulder Press', 1);
    completeSet('Seated Dumbbell Shoulder Press', 2);
    completeSet('Seated Dumbbell Shoulder Press', 3);
    completeSet('Cable Lateral Raise', 1);
    completeSet('Cable Lateral Raise', 2);
    completeSet('Cable Lateral Raise', 3);
    completeSet('Rope Triceps Pushdown', 1);
    completeSet('Rope Triceps Pushdown', 2);
    completeSet('Rope Triceps Pushdown', 3);
    if (!screen.queryByRole('heading', { level: 3, name: 'Couch Stretch' })) {
      fireEvent.click(screen.getByRole('button', { name: /Cooldown/i }));
    }
    completeSet('Couch Stretch', 1);

    fireEvent.change(within(getExerciseCard('Couch Stretch')).getByLabelText('Seconds for set 2'), {
      target: { value: '65' },
    });

    expect(
      screen.getByRole('heading', { level: 2, name: 'How did this session feel?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Session RPE rating' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Energy post workout options' })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Any pain or discomfort? response' }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Session RPE rating' })).getByRole('button', {
        name: '8',
      }),
    );
    fireEvent.click(
      within(
        screen.getByRole('group', { name: 'Energy post workout options' }),
      ).getByRole('button', {
        name: '🙂',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Any pain or discomfort? response' })).getByRole(
        'button',
        {
          name: 'No',
        },
      ),
    );

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Shoulder feel rating' })).getByRole('button', {
        name: '3',
      }),
    );
    fireEvent.change(
      screen.getByDisplayValue('Keep incline press to a 2-count pause on the chest next week.'),
      {
        target: { value: 'Shoulders stayed stable, keep the same setup.' },
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finalize session' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Workout summary' })).toBeVisible();
    expect(screen.getByText('Exercises completed')).toBeInTheDocument();
    expect(screen.getByText('Sets completed')).toBeInTheDocument();
    expect(screen.getByText('Total reps')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Session feedback' })).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    expect(screen.getByText('Shoulders stayed stable, keep the same setup.')).toBeInTheDocument();
    const summaryNotesInput = screen.getByRole('textbox', { name: 'Session notes' });
    expect(summaryNotesInput).toHaveAttribute('id', 'session-summary-notes');
    fireEvent.change(summaryNotesInput, {
      target: { value: 'Session summary note from integration test.' },
    });
    expect(summaryNotesInput).toHaveValue('Session summary note from integration test.');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Workouts' })).toBeVisible();
  }, 15_000);

  it('uses the selected template from the route query string', () => {
    renderActiveWorkoutPage('/workouts/active?template=lower-quad-dominant');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Lower Quad-Dominant' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Exercise 1 of 7')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Post-Workout Supplemental/i }));
    expect(screen.getByText('Dead Bug Breathing')).toBeInTheDocument();
    expect(screen.getByText('Reverse Sled Drag')).toBeInTheDocument();
  });

  it('starts fallback elapsed time from now for unsaved sessions', () => {
    renderActiveWorkoutPage('/workouts/active');

    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('supports manually finishing an active workout with confirmation and set summary ratio', async () => {
    vi.useRealTimers();
    renderActiveWorkoutPage();

    const finishButton = screen.getByRole('button', { name: 'Finish Workout' });
    const finishFooter = finishButton.closest('div');
    expect(finishFooter).not.toBeNull();
    expect(within(finishFooter as HTMLElement).getByText(/\d+\/\d+ sets completed/i)).toBeInTheDocument();

    fireEvent.click(finishButton);
    expect(screen.getByText(/End workout with \d+ sets remaining\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/End workout with \d+ sets remaining\?/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Finish Workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'How did this session feel?' }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Session RPE rating' })).getByRole('button', {
        name: '6',
      }),
    );
    fireEvent.click(
      within(
        screen.getByRole('group', { name: 'Energy post workout options' }),
      ).getByRole('button', {
        name: '😐',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Any pain or discomfort? response' })).getByRole(
        'button',
        {
          name: 'No',
        },
      ),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Shoulder feel rating' })).getByRole('button', {
        name: '3',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finalize session' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Workout summary' })).toBeVisible();
    const setsCompletedLabel = screen.getByText('Sets completed');
    const setsCompletedStat = setsCompletedLabel.closest('div')?.parentElement ?? null;
    expect(setsCompletedStat).not.toBeNull();
    expect(within(setsCompletedStat as HTMLElement).getByText(/\d+\/\d+/)).toBeInTheDocument();
  });

  it('shows standard feedback controls and requires pain details when pain is yes', () => {
    renderActiveWorkoutPage();

    fireEvent.click(screen.getByRole('button', { name: 'Finish Workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    const rpeGroup = screen.getByRole('group', { name: 'Session RPE rating' });
    expect(rpeGroup).toBeInTheDocument();
    expect(within(rpeGroup).getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(within(rpeGroup).getByRole('button', { name: '10' })).toBeInTheDocument();

    const energyGroup = screen.getByRole('group', { name: 'Energy post workout options' });
    expect(energyGroup).toBeInTheDocument();
    fireEvent.click(within(energyGroup).getByRole('button', { name: '💪' }));

    const painGroup = screen.getByRole('group', { name: 'Any pain or discomfort? response' });
    expect(painGroup).toBeInTheDocument();
    fireEvent.click(within(rpeGroup).getByRole('button', { name: '7' }));
    fireEvent.click(within(painGroup).getByRole('button', { name: 'Yes' }));

    expect(screen.getByLabelText('Pain/discomfort details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalize session' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Pain/discomfort details'), {
      target: { value: 'Mild discomfort on deep knee bend during split squats.' },
    });

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Shoulder feel rating' })).getByRole('button', {
        name: '3',
      }),
    );

    expect(screen.getByRole('button', { name: 'Finalize session' })).toBeEnabled();
  });

  it('loads API templates for UUID template ids instead of falling back to mock defaults', async () => {
    vi.useRealTimers();

    const apiTemplateId = '2679a7dd-4a40-4c3e-8bf6-7a70eb4ab5db';
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          data: {
            id: apiTemplateId,
            userId: 'user-1',
            name: 'API Full Body',
            description: 'Loaded from API',
            tags: ['strength'],
            sections: [
              {
                type: 'warmup',
                exercises: [],
              },
              {
                type: 'main',
                exercises: [
                  {
                    id: 'template-exercise-1',
                    exerciseId: 'incline-dumbbell-press',
                    exerciseName: 'Incline Dumbbell Press',
                    sets: 3,
                    repsMin: 8,
                    repsMax: 10,
                    tempo: '3110',
                    restSeconds: 90,
                    supersetGroup: null,
                    notes: null,
                    cues: ['Drive feet into the floor'],
                  },
                ],
              },
              {
                type: 'cooldown',
                exercises: [],
              },
            ],
            createdAt: 100,
            updatedAt: 100,
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', mockFetch);

    renderActiveWorkoutPage(`/workouts/active?template=${apiTemplateId}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'API Full Body' })).toBeVisible();
    expect(screen.getByText('Exercise 1 of 1')).toBeInTheDocument();
  });

  it('creates a completed session without a pre-stored token by using dev auto-session auth', async () => {
    vi.useRealTimers();
    window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
    vi.stubEnv('VITE_PULSE_DEV_USERNAME', 'dev-user');
    vi.stubEnv('VITE_PULSE_DEV_PASSWORD', 'dev-pass');

    const mockFetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/v1/auth/register')) {
        return Promise.resolve(jsonResponse({ data: { token: 'dev-generated-token' } }));
      }

      if (url.endsWith('/api/v1/workout-sessions') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ data: buildCompletedSessionResponse() }));
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal('fetch', mockFetch);

    renderActiveWorkoutPage();

    fireEvent.click(screen.getByRole('button', { name: 'Finish Workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Session RPE rating' })).getByRole('button', {
        name: '7',
      }),
    );
    fireEvent.click(
      within(
        screen.getByRole('group', { name: 'Energy post workout options' }),
      ).getByRole('button', {
        name: '🙂',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Any pain or discomfort? response' })).getByRole(
        'button',
        {
          name: 'No',
        },
      ),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Shoulder feel rating' })).getByRole('button', {
        name: '3',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finalize session' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Workout summary' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Session notes' })).toBeInTheDocument();
    expect(window.localStorage.getItem(API_TOKEN_STORAGE_KEY)).toBe('dev-generated-token');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workout-sessions',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('extracts one exercise note per exercise from persisted session set rows', () => {
    expect(
      extractExerciseNotes([
        {
          completed: true,
          createdAt: 2,
          exerciseId: 'incline-dumbbell-press',
          id: 'set-2',
          notes: 'ignored later note',
          reps: 9,
          section: 'main',
          setNumber: 2,
          skipped: false,
          weight: 45,
        },
        {
          completed: true,
          createdAt: 1,
          exerciseId: 'incline-dumbbell-press',
          id: 'set-1',
          notes: ' Keep shoulders packed ',
          reps: 10,
          section: 'main',
          setNumber: 1,
          skipped: false,
          weight: 50,
        },
        {
          completed: true,
          createdAt: 3,
          exerciseId: 'row-erg',
          id: 'set-3',
          notes: null,
          reps: 240,
          section: 'warmup',
          setNumber: 1,
          skipped: false,
          weight: null,
        },
      ]),
    ).toEqual({
      'incline-dumbbell-press': 'Keep shoulders packed',
    });
  });

  it('maps exercise notes into completion payload session sets', () => {
    const payloadSets = buildSessionSetInputs(
      {
        'incline-dumbbell-press': [
          {
            completed: true,
            distance: null,
            id: 'set-1',
            number: 1,
            reps: 10,
            seconds: null,
            weight: 50,
          },
          {
            completed: true,
            distance: null,
            id: 'set-2',
            number: 2,
            reps: 9,
            seconds: null,
            weight: 45,
          },
        ],
      },
      new Map([
        [
          'incline-dumbbell-press',
          {
            exercise: {
              badges: ['compound', 'push'],
              exerciseId: 'incline-dumbbell-press',
              exerciseName: 'Incline Dumbbell Press',
              formCues: [],
              reps: '8-10',
              restSeconds: 90,
              sets: 2,
              tempo: '3110',
            },
            section: 'main',
            trackingType: 'weight_reps',
          },
        ],
      ]),
      { 'incline-dumbbell-press': ' Keep shoulders packed ' },
    );

    expect(payloadSets).toEqual([
      {
        completed: true,
        exerciseId: 'incline-dumbbell-press',
        notes: 'Keep shoulders packed',
        reps: 10,
        section: 'main',
        setNumber: 1,
        skipped: false,
        weight: 50,
      },
      {
        completed: true,
        exerciseId: 'incline-dumbbell-press',
        notes: null,
        reps: 9,
        section: 'main',
        setNumber: 2,
        skipped: false,
        weight: 45,
      },
    ]);
  });
});

function renderActiveWorkoutPage(initialEntry = '/workouts/active') {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<ActiveWorkoutPage />} path="/workouts/active" />
        <Route element={<h1>Workouts</h1>} path="/workouts" />
      </Routes>
    </MemoryRouter>,
  );
}

function getExerciseCard(name: string) {
  let heading = screen.queryByRole('heading', { level: 3, name });

  if (!heading) {
    for (const sectionLabel of ['Warmup', 'Main', 'Cooldown']) {
      const sectionToggle = screen.queryByRole('button', { name: new RegExp(`^${sectionLabel}`) });

      if (sectionToggle?.getAttribute('aria-expanded') === 'false') {
        fireEvent.click(sectionToggle);
      }
    }

    heading = screen.queryByRole('heading', { level: 3, name });
  }

  const card = heading?.closest('[data-slot="card"]');

  if (!card) {
    throw new Error(`Expected exercise card for ${name}.`);
  }

  return card as HTMLElement;
}

function completeSet(exerciseName: string, setNumber: number) {
  const card = getExerciseCard(exerciseName);
  const weightInput = within(card).queryByLabelText(`Weight for set ${setNumber}`) as
    | HTMLInputElement
    | null;

  if (weightInput && weightInput.value === '') {
    fireEvent.change(weightInput, {
      target: {
        value: '10',
      },
    });
  }

  const input =
    within(card).queryByLabelText(`Reps for set ${setNumber}`) ??
    within(card).queryByLabelText(`Seconds for set ${setNumber}`) ??
    within(card).queryByLabelText(`Distance for set ${setNumber}`) ??
    weightInput;

  if (!input) {
    throw new Error(`Expected a set input for ${exerciseName} set ${setNumber}.`);
  }

  fireEvent.change(input, {
    target: {
      value: '1',
    },
  });

  const skipButton = screen.queryByRole('button', { name: 'Skip' });

  if (skipButton) {
    fireEvent.click(skipButton);
  }
}

function buildCompletedSessionResponse() {
  return {
    id: 'created-session-id',
    userId: 'user-1',
    templateId: null,
    name: 'Upper Push',
    date: '2026-03-06',
    status: 'completed' as const,
    startedAt: 1_000,
    completedAt: 2_000,
    duration: 16,
    feedback: null,
    notes: null,
    sets: [],
    createdAt: 2_000,
    updatedAt: 2_000,
  };
}
