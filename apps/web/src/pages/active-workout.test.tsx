import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';
import { buildSessionSetInputs, extractExerciseNotes } from '@/features/workouts/lib/session-notes';
import {
  ACTIVE_WORKOUT_SESSION_STORAGE_KEY,
  WORKOUT_EXERCISES_STORAGE_PREFIX,
  WORKOUT_SECTIONS_STORAGE_PREFIX,
} from '@/features/workouts/lib/session-persistence';

import { ActiveWorkoutPage } from './active-workout';

vi.mock('sonner', () => {
  const toastMock = vi.fn() as ReturnType<typeof vi.fn> & {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  toastMock.success = vi.fn();
  toastMock.error = vi.fn();

  return {
    toast: toastMock,
  };
});

describe('ActiveWorkoutPage', () => {
  beforeEach(() => {
    vi.mocked(toast).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
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
    window.localStorage.removeItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY);
    const cleanupPrefixes = [
      'pulse.active-workout-draft:',
      `${WORKOUT_SECTIONS_STORAGE_PREFIX}:`,
      `${WORKOUT_EXERCISES_STORAGE_PREFIX}:`,
    ];
    const draftKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && cleanupPrefixes.some((prefix) => key.startsWith(prefix))) {
        draftKeys.push(key);
      }
    }
    for (const key of draftKeys) {
      window.localStorage.removeItem(key);
    }
  });

  it('renders the active workout UI and does not auto-focus a different section after rest timer completion', () => {
    renderActiveWorkoutPage();

    const heading = screen.getByRole('heading', { level: 1, name: 'Upper Push' });
    const headerCard = heading.closest('[data-slot="card"]');
    const progressBar = screen.getByRole('progressbar', { name: 'Workout progress' });
    const stickyProgressStrip = progressBar.closest('.sticky');

    expect(headerCard).not.toHaveClass('sticky');
    expect(stickyProgressStrip).toHaveClass('sticky', 'top-0', 'z-20');
    expect(screen.getByText(/Exercise 1 of \d+/)).toBeInTheDocument();
    expect(screen.getByText(/~\d+ min total estimate/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Session context' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Session Context/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('Recent Training')).toBeInTheDocument();
    expect(screen.getByText('Recovery Status')).toBeInTheDocument();
    expect(screen.getByText('Active Injuries')).toBeInTheDocument();
    expect(screen.getByText('Training Phase')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Session Context/i }));
    expect(
      screen.getByText("Some cards are in preview — sample data is shown and won't be saved."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: /Warmup/i })).getByText('0/2'),
    ).toBeInTheDocument();
    expect(screen.getByText('Superset')).toBeInTheDocument();

    const inclineCard = getExerciseCard('Incline Dumbbell Press');

    fireEvent.change(within(inclineCard).getByLabelText('Weight for set 3'), {
      target: { value: '40' },
    });
    fireEvent.change(within(inclineCard).getByLabelText('Reps for set 3'), {
      target: { value: '9' },
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByText('After Incline Dumbbell Press set 3')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(90_100);
    });

    const nextExerciseCard = getExerciseCard('Row Erg');
    expect(within(nextExerciseCard).getByLabelText('Seconds for set 1')).not.toHaveFocus();
    expect(screen.queryByText('After Incline Dumbbell Press set 3')).not.toBeInTheDocument();

    const optionalCard = getExerciseCard('Rope Triceps Pushdown');
    expect(within(optionalCard).getByText('Optional')).toBeInTheDocument();
  });

  it('triggers rest timer on auto-completion and clears it when a field is emptied', () => {
    renderActiveWorkoutPage();

    const inclineCard = getExerciseCard('Incline Dumbbell Press');

    fireEvent.change(within(inclineCard).getByLabelText('Weight for set 1'), {
      target: { value: '50' },
    });
    fireEvent.change(within(inclineCard).getByLabelText('Reps for set 1'), {
      target: { value: '8' },
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByText('After Incline Dumbbell Press set 1')).toBeInTheDocument();

    fireEvent.change(within(inclineCard).getByLabelText('Weight for set 2'), {
      target: { value: '52.5' },
    });
    fireEvent.change(within(inclineCard).getByLabelText('Reps for set 2'), {
      target: { value: '8' },
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByText('After Incline Dumbbell Press set 2')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    // Editing a value on an already-completed set does not restart the rest timer
    fireEvent.change(within(inclineCard).getByLabelText('Reps for set 2'), {
      target: { value: '9' },
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByText('After Incline Dumbbell Press set 2')).toBeInTheDocument();
    expect(screen.queryByText('1:30')).not.toBeInTheDocument();

    // Clearing a required field auto-uncompletes and clears the rest timer
    fireEvent.change(within(inclineCard).getByLabelText('Reps for set 2'), {
      target: { value: '' },
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.queryByText('After Incline Dumbbell Press set 2')).not.toBeInTheDocument();
  });

  it('moves from session logging to feedback, summary, and back to workouts', async () => {
    vi.useRealTimers();
    renderActiveWorkoutPage();

    const inclineCard = getExerciseCard('Incline Dumbbell Press');

    fireEvent.click(within(inclineCard).getByText('Session notes'));
    fireEvent.change(
      within(inclineCard).getByPlaceholderText(
        'Add any technique reminders, machine settings, or quick context.',
      ),
      {
        target: { value: 'Lower the bench by one notch before the top set.' },
      },
    );
    expect(
      within(inclineCard).getByDisplayValue('Lower the bench by one notch before the top set.'),
    ).toBeVisible();

    completeSet('Row Erg', 1);
    completeSet('Banded Shoulder External Rotation', 1);
    completeSet('Banded Shoulder External Rotation', 2);
    completeSet('Incline Dumbbell Press', 1);
    completeSet('Incline Dumbbell Press', 2);
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

    fireEvent.click(screen.getByRole('button', { name: 'Complete Workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));

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
      within(screen.getByRole('group', { name: 'Energy post workout options' })).getByRole(
        'button',
        {
          name: '🙂',
        },
      ),
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
    const coachNoteInput = screen.getByPlaceholderText(
      'What should we remember next time? Add a carry-forward coaching or programming note.',
    );
    expect(coachNoteInput).toHaveValue('');
    fireEvent.change(coachNoteInput, {
      target: { value: 'Shoulders stayed stable, keep the same setup.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finalize session' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Workout summary' })).toBeVisible();
    expect(screen.getByText(/Total volume|Tracked metrics/)).toBeInTheDocument();
    expect(screen.getByText('Sets')).toBeInTheDocument();
    expect(screen.getAllByText(/Reps|Total reps/).length).toBeGreaterThan(0);
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Exercise results' })).toBeInTheDocument();
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

  it('clears persisted section/exercise ui state when a session is already completed', async () => {
    vi.useRealTimers();
    const sessionId = 'session-completed-1';
    const sectionStateKey = `${WORKOUT_SECTIONS_STORAGE_PREFIX}:${sessionId}`;
    const exerciseStateKey = `${WORKOUT_EXERCISES_STORAGE_PREFIX}:${sessionId}`;
    window.localStorage.setItem(sectionStateKey, JSON.stringify({ warmup: false }));
    window.localStorage.setItem(exerciseStateKey, JSON.stringify({ 'row-erg': false }));

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/v1/auth/register')) {
        return Promise.resolve(jsonResponse({ data: { token: 'dev-generated-token' } }));
      }

      if (url.includes('/api/v1/workout-sessions?status=completed&limit=3')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.includes('/api/v1/workout-sessions?status=in-progress&status=paused')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (
        url.endsWith(`/api/v1/workout-sessions/${sessionId}`) &&
        (!init?.method || init.method === 'GET')
      ) {
        return Promise.resolve(
          jsonResponse({
            data: {
              ...buildInProgressSessionResponse(sessionId),
              completedAt: Date.parse('2026-03-06T12:45:00.000Z'),
              duration: 45,
              status: 'completed',
              timeSegments: [
                {
                  start: '2026-03-06T12:00:00.000Z',
                  end: '2026-03-06T12:45:00.000Z',
                },
              ],
            },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderActiveWorkoutPage(`/workouts/active?sessionId=${sessionId}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Workouts' })).toBeVisible();
    expect(window.localStorage.getItem(sectionStateKey)).toBeNull();
    expect(window.localStorage.getItem(exerciseStateKey)).toBeNull();
  });

  it('uses the selected template from the route query string', () => {
    renderActiveWorkoutPage('/workouts/active?template=lower-quad-dominant');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Lower Quad-Dominant' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Exercise 1 of \d+/)).toBeInTheDocument();
  });

  it('starts fallback elapsed time from now for unsaved sessions', () => {
    renderActiveWorkoutPage('/workouts/active?template=upper-push');

    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('polls for agent session updates and preserves in-progress inputs', async () => {
    const sessionId = 'session-polling-1';
    const fetchMock = vi.fn();
    const baseStartedAt = Date.parse('2026-03-06T12:00:00.000Z');
    let currentSession = {
      id: sessionId,
      userId: 'user-1',
      templateId: 'upper-push',
      name: 'Upper Push',
      date: '2026-03-06',
      status: 'in-progress' as const,
      startedAt: baseStartedAt,
      completedAt: null,
      duration: null,
      timeSegments: [{ start: '2026-03-06T12:00:00.000Z', end: null }],
      feedback: null,
      notes: null,
      sets: [
        {
          id: 'set-1',
          exerciseId: 'incline-dumbbell-press',
          orderIndex: 0,
          setNumber: 1,
          weight: null,
          reps: null,
          completed: false,
          skipped: false,
          section: 'main' as const,
          notes: null,
          createdAt: baseStartedAt,
        },
      ],
      exercises: [
        {
          exerciseId: 'incline-dumbbell-press',
          exerciseName: 'Incline Dumbbell Press',
          orderIndex: 0,
          section: 'main' as const,
          sets: [
            {
              id: 'set-1',
              exerciseId: 'incline-dumbbell-press',
              orderIndex: 0,
              setNumber: 1,
              weight: null,
              reps: null,
              completed: false,
              skipped: false,
              section: 'main' as const,
              notes: null,
              createdAt: baseStartedAt,
            },
          ],
        },
      ],
      createdAt: baseStartedAt,
      updatedAt: baseStartedAt,
    };

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/v1/auth/register')) {
        return Promise.resolve(jsonResponse({ data: { token: 'dev-generated-token' } }));
      }

      if (url.includes('/api/v1/workout-sessions?status=completed&limit=3')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.includes('/api/v1/workout-sessions?status=in-progress&status=paused')) {
        return Promise.resolve(
          jsonResponse({
            data: [buildWorkoutSessionListItem({ id: sessionId, exerciseCount: 1 })],
          }),
        );
      }

      if (
        url.endsWith(`/api/v1/workout-sessions/${sessionId}`) &&
        (!init?.method || init.method === 'GET')
      ) {
        return Promise.resolve(jsonResponse({ data: currentSession }));
      }

      if (url.includes('/api/v1/workout-sessions/') && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ data: currentSession }));
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderActiveWorkoutPage(`/workouts/active?sessionId=${sessionId}`);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    const firstExerciseCard = screen.getByRole('heading', {
      level: 3,
      name: 'Incline Dumbbell Press',
    });
    expect(firstExerciseCard).toBeInTheDocument();

    const inclineCard = getExerciseCard('Incline Dumbbell Press');
    fireEvent.change(within(inclineCard).getByLabelText('Reps for set 1'), {
      target: { value: '9' },
    });

    currentSession = {
      ...currentSession,
      sets: [
        ...currentSession.sets,
        {
          id: 'set-2',
          exerciseId: 'seated-dumbbell-shoulder-press',
          orderIndex: 1,
          setNumber: 1,
          weight: null,
          reps: null,
          completed: false,
          skipped: false,
          section: 'main',
          notes: null,
          createdAt: baseStartedAt + 1,
        },
      ],
      exercises: [
        ...currentSession.exercises,
        {
          exerciseId: 'seated-dumbbell-shoulder-press',
          exerciseName: 'Seated Dumbbell Shoulder Press',
          orderIndex: 1,
          section: 'main',
          sets: [
            {
              id: 'set-2',
              exerciseId: 'seated-dumbbell-shoulder-press',
              orderIndex: 1,
              setNumber: 1,
              weight: null,
              reps: null,
              completed: false,
              skipped: false,
              section: 'main',
              notes: null,
              createdAt: baseStartedAt + 1,
            },
          ],
        },
      ],
      updatedAt: baseStartedAt + 10_000,
    };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_200);
    });

    expect(
      screen.getByRole('heading', { level: 3, name: 'Seated Dumbbell Shoulder Press' }),
    ).toBeInTheDocument();
    expect(
      within(getExerciseCard('Incline Dumbbell Press')).getByLabelText('Reps for set 1'),
    ).toHaveValue(9);
    expect(vi.mocked(toast)).toHaveBeenCalledWith('Workout updated by agent');
  });

  it('pauses and resumes an active session timer using segmented duration', async () => {
    vi.useRealTimers();
    const sessionId = 'session-active-1';
    let currentSession: MutableInProgressSessionResponse = buildInProgressSessionResponse(
      sessionId,
    ) as MutableInProgressSessionResponse;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/v1/auth/register')) {
        return Promise.resolve(jsonResponse({ data: { token: 'dev-generated-token' } }));
      }

      if (url.includes('/api/v1/workout-sessions?status=completed&limit=3')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.includes('/api/v1/workout-sessions?status=in-progress&status=paused')) {
        return Promise.resolve(
          jsonResponse({
            data: [
              buildWorkoutSessionListItem({
                id: sessionId,
                status: currentSession.status,
                templateName: 'Upper Push',
                name: 'Upper Push',
              }),
            ],
          }),
        );
      }

      if (
        url.endsWith(`/api/v1/workout-sessions/${sessionId}`) &&
        (!init?.method || init.method === 'GET')
      ) {
        return Promise.resolve(jsonResponse({ data: currentSession }));
      }

      if (url.endsWith(`/api/v1/workout-sessions/${sessionId}`) && init?.method === 'PATCH') {
        const payload = JSON.parse(String(init.body)) as { status?: 'paused' | 'in-progress' };

        if (payload.status === 'paused') {
          currentSession = {
            ...currentSession,
            status: 'paused',
            timeSegments: [
              {
                start: currentSession.timeSegments[0]?.start ?? '2026-03-06T12:00:00.000Z',
                end: new Date(Date.now()).toISOString(),
              },
            ],
            duration: 65,
          };
        }

        if (payload.status === 'in-progress') {
          currentSession = {
            ...currentSession,
            status: 'in-progress',
            timeSegments: [
              ...(currentSession.timeSegments ?? []),
              {
                start: new Date(Date.now()).toISOString(),
                end: null,
              },
            ],
          };
        }

        return Promise.resolve(jsonResponse({ data: currentSession }));
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderActiveWorkoutPage(`/workouts/active?sessionId=${sessionId}`);

    await screen.findByRole('button', { name: 'Pause' });

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await screen.findByRole('button', { name: 'Resume' });

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await screen.findByRole('button', { name: 'Pause' });

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith(`/api/v1/workout-sessions/${sessionId}`) &&
          init?.method === 'PATCH' &&
          JSON.parse(String(init.body)).status === 'paused',
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith(`/api/v1/workout-sessions/${sessionId}`) &&
          init?.method === 'PATCH' &&
          JSON.parse(String(init.body)).status === 'in-progress',
      ),
    ).toBe(true);
  });

  it('renders an empty state when there is no active session and no selected template', async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/v1/auth/register')) {
        return Promise.resolve(jsonResponse({ data: { token: 'dev-generated-token' } }));
      }

      if (url.includes('/api/v1/workout-sessions?status=completed&limit=3')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.includes('/api/v1/workout-sessions?status=in-progress&status=paused')) {
        return Promise.resolve(
          jsonResponse({
            data: [],
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderActiveWorkoutPage('/workouts/active');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'No active workout' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Start a session from one of your existing templates to begin logging sets.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse templates' })).toHaveAttribute(
      'href',
      '/workouts?view=templates',
    );
  });

  it('shows a session picker when multiple active sessions exist', async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/v1/auth/register')) {
        return Promise.resolve(jsonResponse({ data: { token: 'dev-generated-token' } }));
      }

      if (url.includes('/api/v1/workout-sessions?status=completed&limit=3')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.includes('/api/v1/workout-sessions?status=in-progress&status=paused')) {
        return Promise.resolve(
          jsonResponse({
            data: [
              buildWorkoutSessionListItem({
                id: 'session-active',
                status: 'in-progress',
                templateName: 'Upper Push',
                name: 'Upper Push',
              }),
              buildWorkoutSessionListItem({
                id: 'session-paused',
                status: 'paused',
                templateName: null,
                name: 'Ad-hoc Conditioning',
              }),
            ],
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderActiveWorkoutPage('/workouts/active?view=list');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Choose an active workout' }),
    ).toBeVisible();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /upper push/i })).toHaveAttribute(
      'href',
      '/workouts/active?sessionId=session-active&view=list',
    );
    expect(screen.getByRole('link', { name: /ad-hoc conditioning/i })).toHaveAttribute(
      'href',
      '/workouts/active?sessionId=session-paused&view=list',
    );
  });

  it('shows back-to-session-list navigation while editing one of multiple active sessions', async () => {
    vi.useRealTimers();
    const sessionId = 'session-single-active';
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/v1/auth/register')) {
        return Promise.resolve(jsonResponse({ data: { token: 'dev-generated-token' } }));
      }

      if (url.includes('/api/v1/workout-sessions?status=completed&limit=3')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.includes('/api/v1/workout-sessions?status=in-progress&status=paused')) {
        return Promise.resolve(
          jsonResponse({
            data: [
              buildWorkoutSessionListItem({
                id: sessionId,
                status: 'in-progress',
                templateName: 'Upper Push',
                name: 'Upper Push',
              }),
              buildWorkoutSessionListItem({
                id: 'session-other',
                status: 'paused',
                templateName: 'Lower Body',
                name: 'Lower Body',
              }),
            ],
          }),
        );
      }

      if (
        url.endsWith(`/api/v1/workout-sessions/${sessionId}`) &&
        (!init?.method || init.method === 'GET')
      ) {
        return Promise.resolve(jsonResponse({ data: buildInProgressSessionResponse(sessionId) }));
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderActiveWorkoutPage(`/workouts/active?sessionId=${sessionId}&view=list`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Upper Push' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to session list' })).toHaveAttribute(
      'href',
      '/workouts/active?view=list',
    );
  });

  it('skips the session picker and opens the editor when exactly one active session exists', async () => {
    vi.useRealTimers();
    const sessionId = 'session-only-active';
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/v1/auth/register')) {
        return Promise.resolve(jsonResponse({ data: { token: 'dev-generated-token' } }));
      }

      if (url.includes('/api/v1/workout-sessions?status=completed&limit=3')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.includes('/api/v1/workout-sessions?status=in-progress&status=paused')) {
        return Promise.resolve(
          jsonResponse({
            data: [
              buildWorkoutSessionListItem({
                id: sessionId,
                status: 'in-progress',
                templateName: 'Upper Push',
                name: 'Upper Push',
              }),
            ],
          }),
        );
      }

      if (
        url.endsWith(`/api/v1/workout-sessions/${sessionId}`) &&
        (!init?.method || init.method === 'GET')
      ) {
        return Promise.resolve(jsonResponse({ data: buildInProgressSessionResponse(sessionId) }));
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderActiveWorkoutPage('/workouts/active');

    expect(await screen.findByRole('heading', { level: 1, name: 'Upper Push' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Choose an active workout' }),
    ).not.toBeInTheDocument();
  });

  it('supports manually finishing an active workout with confirmation and set summary ratio', async () => {
    vi.useRealTimers();
    renderActiveWorkoutPage();

    const completeButton = screen.getByRole('button', { name: 'Complete Workout' });
    const completeFooter = completeButton.closest('div');
    expect(completeFooter).not.toBeNull();
    expect(
      within(completeFooter as HTMLElement).getByText(/\d+\/\d+ sets completed/i),
    ).toBeInTheDocument();

    fireEvent.click(completeButton);
    expect(screen.getByText(/End workout with \d+ sets remaining\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/End workout with \d+ sets remaining\?/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Complete Workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'How did this session feel?' }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Session RPE rating' })).getByRole('button', {
        name: '6',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Energy post workout options' })).getByRole(
        'button',
        {
          name: '😐',
        },
      ),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Any pain or discomfort? response' })).getByRole(
        'button',
        {
          name: 'No',
        },
      ),
    );
    expect(
      screen.getByPlaceholderText(
        'What should we remember next time? Add a carry-forward coaching or programming note.',
      ),
    ).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Finalize session' })).toBeDisabled();
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Shoulder feel rating' })).getByRole('button', {
        name: '3',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finalize session' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Workout summary' })).toBeVisible();
    expect(screen.getByTestId('summary-pill-count-sets')).toHaveTextContent(/\d+\/\d+/);
  });

  it('keeps the session active after the last set until completion is explicitly confirmed', () => {
    vi.useRealTimers();
    renderActiveWorkoutPage();

    completeSet('Row Erg', 1);
    completeSet('Banded Shoulder External Rotation', 1);
    completeSet('Banded Shoulder External Rotation', 2);
    completeSet('Incline Dumbbell Press', 1);
    completeSet('Incline Dumbbell Press', 2);
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
    completeSet('Couch Stretch', 2);

    expect(screen.getByRole('button', { name: 'Complete Workout' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'How did this session feel?' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Complete Workout' }));
    expect(screen.getByText('Complete this workout?')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'How did this session feel?' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Complete this workout?')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'How did this session feel?' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Complete Workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'How did this session feel?' }),
    ).toBeInTheDocument();
  });

  it('shows standard feedback controls and requires pain details when pain is yes', () => {
    renderActiveWorkoutPage();

    fireEvent.click(screen.getByRole('button', { name: 'Complete Workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));

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
    expect(screen.getByText(/Exercise 1 of \d+/)).toBeInTheDocument();
  });

  it('renders reps_only and seconds_only inputs from API template tracking types', async () => {
    vi.useRealTimers();
    const templateId = '2679a7dd-4a40-4c3e-8bf6-7a70eb4ab5db';
    const startedAt = Date.parse('2026-03-06T12:00:00.000Z');
    const mockFetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/v1/auth/register')) {
        return Promise.resolve(jsonResponse({ data: { token: 'dev-generated-token' } }));
      }

      if (url.endsWith(`/api/v1/workout-templates/${templateId}`)) {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: templateId,
              userId: 'user-1',
              name: 'Tracking QA',
              description: null,
              tags: [],
              sections: [
                {
                  type: 'warmup',
                  exercises: [],
                },
                {
                  type: 'main',
                  exercises: [
                    {
                      id: 'template-exercise-dead-bug',
                      exerciseId: 'dead-bug',
                      exerciseName: 'Dead Bug',
                      trackingType: 'reps_only',
                      sets: 1,
                      repsMin: 12,
                      repsMax: 12,
                      tempo: '2111',
                      restSeconds: 60,
                      supersetGroup: null,
                      notes: null,
                      cues: [],
                    },
                  ],
                },
                {
                  type: 'cooldown',
                  exercises: [
                    {
                      id: 'template-exercise-dead-hang',
                      exerciseId: 'dead-hang',
                      exerciseName: 'Dead Hang',
                      trackingType: 'seconds_only',
                      sets: 1,
                      repsMin: 30,
                      repsMax: 30,
                      tempo: '2111',
                      restSeconds: 60,
                      supersetGroup: null,
                      notes: null,
                      cues: [],
                    },
                    {
                      id: 'template-exercise-couch-stretch',
                      exerciseId: 'couch-stretch',
                      exerciseName: 'Couch Stretch',
                      trackingType: 'seconds_only',
                      sets: 1,
                      repsMin: 45,
                      repsMax: 45,
                      tempo: '2111',
                      restSeconds: 60,
                      supersetGroup: null,
                      notes: null,
                      cues: [],
                    },
                  ],
                },
              ],
              createdAt: startedAt,
              updatedAt: startedAt,
            },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal('fetch', mockFetch);

    renderActiveWorkoutPage(`/workouts/active?template=${templateId}`);
    await screen.findByRole('heading', { level: 1, name: 'Tracking QA' });
    await waitFor(() => {
      expect(screen.getByText(/0\/\d+ sets completed/)).toBeInTheDocument();
    });

    const deadBugCard = getExerciseCard('Dead Bug');
    expect(within(deadBugCard).getByLabelText('Reps for set 1')).toBeInTheDocument();
    expect(within(deadBugCard).queryByLabelText('Weight for set 1')).not.toBeInTheDocument();

    const deadHangCard = getExerciseCard('Dead Hang');
    expect(within(deadHangCard).getByLabelText('Seconds for set 1')).toBeInTheDocument();
    expect(within(deadHangCard).queryByLabelText('Reps for set 1')).not.toBeInTheDocument();
    expect(within(deadHangCard).queryByLabelText('Weight for set 1')).not.toBeInTheDocument();

    const couchStretchCard = getExerciseCard('Couch Stretch');
    expect(within(couchStretchCard).getByLabelText('Seconds for set 1')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Complete Workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Session RPE rating' })).getByRole('button', {
        name: '7',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Energy post workout options' })).getByRole(
        'button',
        {
          name: '🙂',
        },
      ),
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
      expect.objectContaining({
        completed: true,
        exerciseId: 'incline-dumbbell-press',
        orderIndex: 0,
        notes: 'Keep shoulders packed',
        reps: 10,
        section: 'main',
        setNumber: 1,
        skipped: false,
        supersetGroup: null,
        weight: 50,
      }),
      expect.objectContaining({
        completed: true,
        exerciseId: 'incline-dumbbell-press',
        orderIndex: 0,
        notes: null,
        reps: 9,
        section: 'main',
        setNumber: 2,
        skipped: false,
        supersetGroup: null,
        weight: 45,
      }),
    ]);
  });

  it('forces weight to null for non-weighted tracking types in completion payloads', () => {
    const payloadSets = buildSessionSetInputs(
      {
        'dead-bug': [
          {
            completed: true,
            distance: null,
            id: 'dead-bug-set-1',
            number: 1,
            reps: 12,
            seconds: null,
            weight: 0,
          },
        ],
        'dead-hang': [
          {
            completed: true,
            distance: null,
            id: 'dead-hang-set-1',
            number: 1,
            reps: null,
            seconds: 30,
            weight: 0,
          },
        ],
      },
      new Map([
        [
          'dead-bug',
          {
            exercise: {
              badges: ['mobility'],
              exerciseId: 'dead-bug',
              exerciseName: 'Dead Bug',
              formCues: [],
              reps: '12',
              restSeconds: 45,
              sets: 1,
              tempo: '2111',
              trackingType: 'reps_only',
            },
            section: 'main',
            trackingType: 'reps_only',
          },
        ],
        [
          'dead-hang',
          {
            exercise: {
              badges: ['mobility'],
              exerciseId: 'dead-hang',
              exerciseName: 'Dead Hang',
              formCues: [],
              reps: '30 sec',
              restSeconds: 45,
              sets: 1,
              tempo: '2111',
              trackingType: 'seconds_only',
            },
            section: 'cooldown',
            trackingType: 'seconds_only',
          },
        ],
      ]),
      {},
    );

    expect(payloadSets).toEqual([
      expect.objectContaining({
        completed: true,
        exerciseId: 'dead-bug',
        notes: null,
        orderIndex: 0,
        reps: 12,
        section: 'main',
        setNumber: 1,
        skipped: false,
        supersetGroup: null,
        weight: null,
      }),
      expect.objectContaining({
        completed: true,
        exerciseId: 'dead-hang',
        notes: null,
        orderIndex: 0,
        reps: 30,
        section: 'cooldown',
        setNumber: 1,
        skipped: false,
        supersetGroup: null,
        weight: null,
      }),
    ]);
  });
});

function renderActiveWorkoutPage(initialEntry = '/workouts/active?template=upper-push') {
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

  const exerciseToggle = within(card as HTMLElement)
    .queryAllByRole('button')
    .find((button) => button.getAttribute('aria-controls')?.startsWith('exercise-panel-'));
  if (exerciseToggle?.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(exerciseToggle);
  }

  return card as HTMLElement;
}

function completeSet(exerciseName: string, setNumber: number) {
  const card = getExerciseCard(exerciseName);
  const weightInput = within(card).queryByLabelText(
    `Weight for set ${setNumber}`,
  ) as HTMLInputElement | null;

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
  fireEvent.blur(input);

  const skipButton = screen.queryByRole('button', { name: /Skip rest timer/i });

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
    timeSegments: [
      {
        start: '2026-03-06T12:00:00.000Z',
        end: '2026-03-06T12:16:00.000Z',
      },
    ],
    feedback: null,
    notes: null,
    sets: [],
    createdAt: 2_000,
    updatedAt: 2_000,
  };
}

function buildInProgressSessionResponse(sessionId: string) {
  return {
    id: sessionId,
    userId: 'user-1',
    templateId: 'upper-push',
    name: 'Upper Push',
    date: '2026-03-06',
    status: 'in-progress' as const,
    startedAt: Date.parse('2026-03-06T12:00:00.000Z'),
    completedAt: null,
    duration: null,
    timeSegments: [
      {
        start: '2026-03-06T12:00:00.000Z',
        end: null,
      },
    ],
    feedback: null,
    notes: null,
    sets: [],
    createdAt: Date.parse('2026-03-06T12:00:00.000Z'),
    updatedAt: Date.parse('2026-03-06T12:00:00.000Z'),
  };
}

function buildWorkoutSessionListItem(
  overrides: Partial<{
    id: string;
    name: string;
    status: 'in-progress' | 'paused';
    templateId: string | null;
    templateName: string | null;
    startedAt: number;
    exerciseCount: number;
  }> = {},
) {
  return {
    id: 'session-list-item',
    name: 'Workout Session',
    date: '2026-03-06',
    status: 'in-progress' as const,
    templateId: 'upper-push',
    templateName: 'Upper Push',
    startedAt: Date.parse('2026-03-06T12:00:00.000Z'),
    completedAt: null,
    duration: null,
    exerciseCount: 4,
    createdAt: Date.parse('2026-03-06T12:00:00.000Z'),
    ...overrides,
  };
}

type MutableInProgressSessionResponse = Omit<
  ReturnType<typeof buildInProgressSessionResponse>,
  'status' | 'duration' | 'timeSegments'
> & {
  status: 'in-progress' | 'paused';
  duration: number | null;
  timeSegments: Array<{ start: string; end: string | null }>;
};
