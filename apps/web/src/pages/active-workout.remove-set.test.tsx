import type { MouseEvent, ReactNode } from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { workoutQueryKeys } from '@/features/workouts/api/workouts';
import {
  ACTIVE_WORKOUT_SESSION_STORAGE_KEY,
  WORKOUT_EXERCISES_STORAGE_PREFIX,
  WORKOUT_SECTIONS_STORAGE_PREFIX,
  getStoredActiveWorkoutDraft,
} from '@/features/workouts/lib/session-persistence';
import { workoutSessionQueryKeys } from '@/hooks/use-workout-session';
import { createAppQueryClient } from '@/lib/query-client';
import { jsonResponse } from '@/test/test-utils';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { getMockTemplate } from '@/test/fixtures/workouts';

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

describe('ActiveWorkoutPage remove-set flow', () => {
  beforeEach(() => {
    vi.mocked(toast).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.useRealTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00.000Z'));
    vi.stubEnv('VITE_PULSE_DEV_USERNAME', 'dev-user');
    vi.stubEnv('VITE_PULSE_DEV_PASSWORD', 'dev-pass');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.removeItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY);
    const cleanupPrefixes = [
      'pulse.active-workout-draft:',
      `${WORKOUT_SECTIONS_STORAGE_PREFIX}:`,
      `${WORKOUT_EXERCISES_STORAGE_PREFIX}:`,
    ];
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && cleanupPrefixes.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  });

  it('calls delete with session/set ids, removes optimistically, and stays removed after refetch', async () => {
    const sessionId = 'session-delete-set-success';
    const startedAt = Date.parse('2026-03-06T12:00:00.000Z');
    const deleteDeferred = createDeferredPromise<Response>();
    let currentSession: MutableInProgressSessionResponse = {
      ...buildInProgressSessionResponse(sessionId),
      exercises: [
        {
          exerciseId: 'incline-dumbbell-press',
          exerciseName: 'Incline Dumbbell Press',
          orderIndex: 0,
          section: 'main',
          sets: [
            buildSessionSet({
              createdAt: startedAt,
              exerciseId: 'incline-dumbbell-press',
              id: 'set-main-1',
              orderIndex: 0,
              section: 'main',
              setNumber: 1,
            }),
            buildSessionSet({
              createdAt: startedAt + 1,
              exerciseId: 'incline-dumbbell-press',
              id: 'set-main-2',
              orderIndex: 0,
              section: 'main',
              setNumber: 2,
            }),
            buildSessionSet({
              createdAt: startedAt + 2,
              exerciseId: 'incline-dumbbell-press',
              id: 'set-main-3',
              orderIndex: 0,
              section: 'main',
              setNumber: 3,
            }),
          ],
        },
      ],
      sets: [
        buildSessionSet({
          createdAt: startedAt,
          exerciseId: 'incline-dumbbell-press',
          id: 'set-main-1',
          orderIndex: 0,
          section: 'main',
          setNumber: 1,
        }),
        buildSessionSet({
          createdAt: startedAt + 1,
          exerciseId: 'incline-dumbbell-press',
          id: 'set-main-2',
          orderIndex: 0,
          section: 'main',
          setNumber: 2,
        }),
        buildSessionSet({
          createdAt: startedAt + 2,
          exerciseId: 'incline-dumbbell-press',
          id: 'set-main-3',
          orderIndex: 0,
          section: 'main',
          setNumber: 3,
        }),
      ],
      updatedAt: startedAt,
    };

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/v1/auth/register')) {
        return Promise.resolve(jsonResponse({ data: { token: 'dev-generated-token' } }));
      }

      if (url.endsWith('/api/v1/workout-templates/upper-push') && (!init?.method || init.method === 'GET')) {
        const template = buildWorkoutTemplateResponse('upper-push');
        if (!template) {
          return Promise.reject(new Error('Expected upper-push template fixture.'));
        }

        return Promise.resolve(jsonResponse({ data: template }));
      }

      if (
        url.endsWith(`/api/v1/workout-sessions/${sessionId}`) &&
        (!init?.method || init.method === 'GET')
      ) {
        return Promise.resolve(jsonResponse({ data: currentSession }));
      }

      if (
        url.endsWith(`/api/v1/workout-sessions/${sessionId}/sets/set-main-3`) &&
        init?.method === 'DELETE'
      ) {
        return deleteDeferred.promise;
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const queryClient = createAppQueryClient();
    queryClient.clear();
    const seededTemplate = buildWorkoutTemplateResponse('upper-push');
    if (!seededTemplate) {
      throw new Error('Expected upper-push fixture template.');
    }
    queryClient.setQueryData(workoutQueryKeys.template('upper-push'), seededTemplate);
    queryClient.setQueryData(workoutSessionQueryKeys.detail(sessionId), currentSession);

    renderWithQueryClient(
      <MemoryRouter initialEntries={[`/workouts/active?sessionId=${sessionId}&template=upper-push`]}>
        <Routes>
          <Route element={<ActiveWorkoutPage />} path="/workouts/active" />
          <Route element={<h1>Workouts</h1>} path="/workouts" />
        </Routes>
      </MemoryRouter>,
      { queryClient },
    );

    await screen.findByRole('heading', { level: 1, name: 'Upper Push' });
    const inclineCard = getExerciseCard('Incline Dumbbell Press');
    expect(within(inclineCard).getByLabelText('Reps for set 3')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        getStoredActiveWorkoutDraft(sessionId)?.setDrafts['incline-dumbbell-press']?.map(
          (set) => set.id,
        ),
      ).toEqual(['set-main-1', 'set-main-2', 'set-main-3']);
    });

    const removeSetButtons = within(inclineCard).getAllByRole('button', {
      name: 'Remove Last Set',
    });
    const removeSetButton = [...removeSetButtons]
      .reverse()
      .find((button) => !button.hasAttribute('disabled'));
    expect(removeSetButton).toBeDefined();
    fireEvent.click(removeSetButton as HTMLElement);

    await waitFor(() => {
      expect(within(getExerciseCard('Incline Dumbbell Press')).queryByLabelText('Reps for set 3')).toBeNull();
    });

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith(`/api/v1/workout-sessions/${sessionId}/sets/set-main-3`) &&
          init?.method === 'DELETE',
      ),
    ).toBe(true);
    expect(
      screen.queryByText('Removing sets is local-only right now and may not sync across devices.'),
    ).toBeNull();

    currentSession = {
      ...currentSession,
      exercises: [
        {
          ...currentSession.exercises[0],
          sets: [
            buildSessionSet({
              createdAt: startedAt,
              exerciseId: 'incline-dumbbell-press',
              id: 'set-main-1',
              orderIndex: 0,
              section: 'main',
              setNumber: 1,
            }),
            buildSessionSet({
              createdAt: startedAt + 1,
              exerciseId: 'incline-dumbbell-press',
              id: 'set-main-2',
              orderIndex: 0,
              section: 'main',
              setNumber: 2,
            }),
          ],
        },
      ],
      sets: [
        buildSessionSet({
          createdAt: startedAt,
          exerciseId: 'incline-dumbbell-press',
          id: 'set-main-1',
          orderIndex: 0,
          section: 'main',
          setNumber: 1,
        }),
        buildSessionSet({
          createdAt: startedAt + 1,
          exerciseId: 'incline-dumbbell-press',
          id: 'set-main-2',
          orderIndex: 0,
          section: 'main',
          setNumber: 2,
        }),
      ],
      updatedAt: startedAt + 20_000,
    };

    await act(async () => {
      deleteDeferred.resolve(jsonResponse({ data: currentSession }));
      await deleteDeferred.promise;
    });

    await waitFor(() => {
      expect(within(getExerciseCard('Incline Dumbbell Press')).queryByLabelText('Reps for set 3')).toBeNull();
      const draft = getStoredActiveWorkoutDraft(sessionId);
      expect(draft?.setDrafts['incline-dumbbell-press']?.map((set) => set.number)).toEqual([1, 2]);
    });

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: workoutSessionQueryKeys.detail(sessionId),
      });
    });

    await waitFor(() => {
      expect(within(getExerciseCard('Incline Dumbbell Press')).queryByLabelText('Reps for set 3')).toBeNull();
    });
  });

  it('rolls back optimistic set removal and shows an error when delete fails', async () => {
    const sessionId = 'session-delete-set-error';
    const startedAt = Date.parse('2026-03-06T12:00:00.000Z');
    const deleteDeferred = createDeferredPromise<Response>();
    const currentSession: MutableInProgressSessionResponse = {
      ...buildInProgressSessionResponse(sessionId),
      exercises: [
        {
          exerciseId: 'incline-dumbbell-press',
          exerciseName: 'Incline Dumbbell Press',
          orderIndex: 0,
          section: 'main',
          sets: [
            buildSessionSet({
              createdAt: startedAt,
              exerciseId: 'incline-dumbbell-press',
              id: 'set-main-1',
              orderIndex: 0,
              section: 'main',
              setNumber: 1,
            }),
            buildSessionSet({
              createdAt: startedAt + 1,
              exerciseId: 'incline-dumbbell-press',
              id: 'set-main-2',
              orderIndex: 0,
              section: 'main',
              setNumber: 2,
            }),
            buildSessionSet({
              createdAt: startedAt + 2,
              exerciseId: 'incline-dumbbell-press',
              id: 'set-main-3',
              orderIndex: 0,
              section: 'main',
              setNumber: 3,
            }),
          ],
        },
      ],
      sets: [
        buildSessionSet({
          createdAt: startedAt,
          exerciseId: 'incline-dumbbell-press',
          id: 'set-main-1',
          orderIndex: 0,
          section: 'main',
          setNumber: 1,
        }),
        buildSessionSet({
          createdAt: startedAt + 1,
          exerciseId: 'incline-dumbbell-press',
          id: 'set-main-2',
          orderIndex: 0,
          section: 'main',
          setNumber: 2,
        }),
        buildSessionSet({
          createdAt: startedAt + 2,
          exerciseId: 'incline-dumbbell-press',
          id: 'set-main-3',
          orderIndex: 0,
          section: 'main',
          setNumber: 3,
        }),
      ],
      updatedAt: startedAt,
    };

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/v1/auth/register')) {
        return Promise.resolve(jsonResponse({ data: { token: 'dev-generated-token' } }));
      }

      if (url.endsWith('/api/v1/workout-templates/upper-push') && (!init?.method || init.method === 'GET')) {
        const template = buildWorkoutTemplateResponse('upper-push');
        if (!template) {
          return Promise.reject(new Error('Expected upper-push template fixture.'));
        }

        return Promise.resolve(jsonResponse({ data: template }));
      }

      if (
        url.endsWith(`/api/v1/workout-sessions/${sessionId}`) &&
        (!init?.method || init.method === 'GET')
      ) {
        return Promise.resolve(jsonResponse({ data: currentSession }));
      }

      if (
        url.endsWith(`/api/v1/workout-sessions/${sessionId}/sets/set-main-3`) &&
        init?.method === 'DELETE'
      ) {
        return deleteDeferred.promise;
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const queryClient = createAppQueryClient();
    queryClient.clear();
    const seededTemplate = buildWorkoutTemplateResponse('upper-push');
    if (!seededTemplate) {
      throw new Error('Expected upper-push fixture template.');
    }
    queryClient.setQueryData(workoutQueryKeys.template('upper-push'), seededTemplate);
    queryClient.setQueryData(workoutSessionQueryKeys.detail(sessionId), currentSession);

    renderWithQueryClient(
      <MemoryRouter initialEntries={[`/workouts/active?sessionId=${sessionId}&template=upper-push`]}>
        <Routes>
          <Route element={<ActiveWorkoutPage />} path="/workouts/active" />
          <Route element={<h1>Workouts</h1>} path="/workouts" />
        </Routes>
      </MemoryRouter>,
      { queryClient },
    );

    await screen.findByRole('heading', { level: 1, name: 'Upper Push' });
    const inclineCard = getExerciseCard('Incline Dumbbell Press');
    expect(within(inclineCard).getByLabelText('Reps for set 3')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        getStoredActiveWorkoutDraft(sessionId)?.setDrafts['incline-dumbbell-press']?.map(
          (set) => set.id,
        ),
      ).toEqual(['set-main-1', 'set-main-2', 'set-main-3']);
    });

    const removeSetButtons = within(inclineCard).getAllByRole('button', {
      name: 'Remove Last Set',
    });
    const removeSetButton = [...removeSetButtons]
      .reverse()
      .find((button) => !button.hasAttribute('disabled'));
    expect(removeSetButton).toBeDefined();
    fireEvent.click(removeSetButton as HTMLElement);

    await waitFor(() => {
      expect(within(getExerciseCard('Incline Dumbbell Press')).queryByLabelText('Reps for set 3')).toBeNull();
    });

    await act(async () => {
      deleteDeferred.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'INTERNAL',
              message: 'Delete failed',
            },
          }),
          {
            headers: {
              'Content-Type': 'application/json',
            },
            status: 500,
          },
        ),
      );
      await deleteDeferred.promise;
    });

    await waitFor(() => {
      expect(within(getExerciseCard('Incline Dumbbell Press')).getByLabelText('Reps for set 3')).toBeInTheDocument();
      expect(screen.getByText('Unable to remove set. Try again.')).toBeInTheDocument();
      const draft = getStoredActiveWorkoutDraft(sessionId);
      expect(draft?.setDrafts['incline-dumbbell-press']?.map((set) => set.number)).toEqual([
        1,
        2,
        3,
      ]);
    });
  });
});

function createDeferredPromise<T>() {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;

  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value: T | PromiseLike<T>) => {
      if (!resolvePromise) {
        throw new Error('Deferred promise was not initialized.');
      }

      resolvePromise(value);
    },
  };
}

function buildWorkoutTemplateResponse(templateId: string) {
  const fixtureTemplate = getMockTemplate(templateId);
  if (!fixtureTemplate) {
    return null;
  }

  let exerciseIndex = 0;

  return {
    id: fixtureTemplate.id,
    userId: 'user-1',
    name: fixtureTemplate.name,
    description: fixtureTemplate.description,
    tags: fixtureTemplate.tags,
    sections: fixtureTemplate.sections.map((section) => ({
      type: section.type,
      exercises: section.exercises.map((exercise) => {
        const reps = parseFixtureReps(exercise.reps);
        exerciseIndex += 1;

        return {
          id: `${fixtureTemplate.id}-exercise-${exerciseIndex}`,
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName ?? startCase(exercise.exerciseId),
          trackingType: exercise.trackingType ?? null,
          sets: exercise.sets,
          repsMin: reps.repsMin,
          repsMax: reps.repsMax,
          tempo: exercise.tempo,
          restSeconds: exercise.restSeconds,
          supersetGroup: exercise.supersetGroup ?? null,
          notes: null,
          cues: exercise.templateCues ?? [],
          formCues: exercise.formCues,
        };
      }),
    })),
    createdAt: 1,
    updatedAt: 1,
  };
}

function parseFixtureReps(value: string): { repsMax: number | null; repsMin: number | null } {
  const rangeMatch = value.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return {
      repsMin: Number(rangeMatch[1]),
      repsMax: Number(rangeMatch[2]),
    };
  }

  const singleMatch = value.match(/\d+/);
  if (singleMatch) {
    const reps = Number(singleMatch[0]);
    return {
      repsMin: reps,
      repsMax: reps,
    };
  }

  return {
    repsMin: null,
    repsMax: null,
  };
}

function startCase(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function buildInProgressSessionResponse(sessionId: string): MutableInProgressSessionResponse {
  return {
    id: sessionId,
    userId: 'user-1',
    templateId: 'upper-push',
    name: 'Upper Push',
    date: '2026-03-06',
    status: 'in-progress',
    startedAt: Date.parse('2026-03-06T12:00:00.000Z'),
    completedAt: null,
    duration: null,
    timeSegments: [
      {
        start: '2026-03-06T12:00:00.000Z',
        end: null,
        section: 'main',
      },
    ],
    sectionDurations: {
      warmup: 0,
      main: 0,
      cooldown: 0,
      supplemental: 0,
    },
    feedback: null,
    notes: null,
    sets: [],
    exercises: [],
    createdAt: Date.parse('2026-03-06T12:00:00.000Z'),
    updatedAt: Date.parse('2026-03-06T12:00:00.000Z'),
  };
}

function buildSessionSet(input: {
  createdAt: number;
  exerciseId: string;
  id: string;
  orderIndex: number;
  section: 'warmup' | 'main' | 'cooldown' | 'supplemental';
  setNumber: number;
}) {
  return {
    id: input.id,
    exerciseId: input.exerciseId,
    orderIndex: input.orderIndex,
    setNumber: input.setNumber,
    weight: null,
    reps: null,
    completed: false,
    skipped: false,
    section: input.section,
    notes: null,
    createdAt: input.createdAt,
  };
}

type MutableInProgressSessionResponse = {
  id: string;
  userId: string;
  templateId: string;
  name: string;
  date: string;
  status: 'in-progress' | 'paused';
  startedAt: number;
  completedAt: number | null;
  duration: number | null;
  sectionDurations: {
    warmup: number;
    main: number;
    cooldown: number;
    supplemental: number;
  };
  timeSegments: Array<{
    start: string;
    end: string | null;
    section: 'warmup' | 'main' | 'cooldown' | 'supplemental';
  }>;
  feedback: null;
  notes: null;
  sets: Array<{
    id: string;
    exerciseId: string | null;
    orderIndex: number;
    setNumber: number;
    weight: number | null;
    reps: number | null;
    completed: boolean;
    skipped: boolean;
    section: 'warmup' | 'main' | 'cooldown' | 'supplemental';
    notes: string | null;
    createdAt: number;
  }>;
  exercises: Array<{
    exerciseId: string;
    exerciseName: string | null;
    orderIndex: number;
    section: 'warmup' | 'main' | 'cooldown' | 'supplemental' | null;
    sets: Array<{
      id: string;
      exerciseId: string | null;
      orderIndex: number;
      setNumber: number;
      weight: number | null;
      reps: number | null;
      completed: boolean;
      skipped: boolean;
      section: 'warmup' | 'main' | 'cooldown' | 'supplemental';
      notes: string | null;
      createdAt: number;
    }>;
  }>;
  createdAt: number;
  updatedAt: number;
};
