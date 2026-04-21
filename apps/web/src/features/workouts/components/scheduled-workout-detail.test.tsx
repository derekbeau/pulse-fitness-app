import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toDateKey } from '@/lib/date-utils';
import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

vi.mock('./schedule-workout-dialog', () => ({
  ScheduleWorkoutDialog: ({
    onOpenChange,
    onSubmitDate,
    open,
    title,
  }: {
    onOpenChange: (open: boolean) => void;
    onSubmitDate: (dateKey: string) => Promise<unknown>;
    open: boolean;
    title: string;
  }) => {
    if (!open) {
      return null;
    }

    return (
      <div>
        <p>{title}</p>
        <button
          onClick={() => {
            void onSubmitDate('2099-12-31');
          }}
          type="button"
        >
          Submit reschedule
        </button>
        <button onClick={() => onOpenChange(false)} type="button">
          Close reschedule
        </button>
      </div>
    );
  },
}));

vi.mock('./swap-exercise-dialog', () => ({
  SwapExerciseDialog: ({
    open,
    sourceExerciseId,
    sourceExerciseName,
  }: {
    open: boolean;
    sourceExerciseId: string;
    sourceExerciseName: string;
  }) => {
    if (!open) {
      return null;
    }

    return (
      <div data-testid="swap-exercise-dialog">
        <p>{sourceExerciseName}</p>
        <p>{sourceExerciseId}</p>
      </div>
    );
  },
}));

import { ScheduledWorkoutDetail } from './scheduled-workout-detail';

beforeEach(() => {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
});

afterEach(() => {
  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  vi.restoreAllMocks();
});

describe('ScheduledWorkoutDetail', () => {
  it('renders snapshot exercise cards with programming and agent notes', async () => {
    const detail = createScheduledWorkoutDetailPayload({
      date: toDateKey(new Date()),
      exercises: [
        {
          exerciseId: 'incline-dumbbell-press',
          exerciseName: 'Incline Dumbbell Press',
          section: 'main',
          orderIndex: 0,
          programmingNotes: 'Top set first, then reduce load for back-off sets.',
          agentNotes: 'Last session looked smooth; try 62 lb if warmup set is easy.',
          agentNotesMeta: {
            author: 'Coach Pulse',
            generatedAt: '2026-03-16T09:30:00.000Z',
            scheduledDateAtGeneration: '2026-03-16',
            stale: false,
          },
          templateCues: ['Drive feet into the floor', 'Keep wrists stacked'],
          supersetGroup: null,
          tempo: '3110',
          restSeconds: 90,
          sets: [
            {
              setNumber: 1,
              repsMin: 8,
              repsMax: 10,
              reps: null,
              targetWeight: 70,
              targetWeightMin: null,
              targetWeightMax: null,
              targetSeconds: null,
              targetDistance: null,
            },
          ],
        },
      ],
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/scheduled-workouts/scheduled-1' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: detail }));
      }

      if (url.pathname === '/api/v1/workout-sessions' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <ScheduledWorkoutDetail id="scheduled-1" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Upper Push' }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('workout-exercise-card-snapshot-main-0-incline-dumbbell-press'),
    ).toBeInTheDocument();
    expect(screen.getByText('Programming notes')).toBeInTheDocument();
    expect(screen.getByText('For today')).toBeInTheDocument();
    expect(
      screen.getByText('Top set first, then reduce load for back-off sets.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Last session looked smooth; try 62 lb if warmup set is easy.'),
    ).toBeInTheDocument();
  });

  it('renders template drift, stale exercise, and template deleted banners from marker states', async () => {
    const detail = createScheduledWorkoutDetailPayload({
      date: toDateKey(new Date()),
      staleExercises: [
        {
          exerciseId: 'deleted-exercise',
          snapshotName: 'Dips',
        },
      ],
      templateDeleted: true,
      templateDrift: {
        changedAt: Date.UTC(2026, 2, 16, 12, 0, 0),
        summary: 'Template has been updated since scheduling.',
      },
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/scheduled-workouts/scheduled-1' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: detail }));
      }

      if (url.pathname === '/api/v1/workout-sessions' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <ScheduledWorkoutDetail id="scheduled-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('scheduled-template-drift-banner')).toBeInTheDocument();
    expect(screen.getByTestId('scheduled-stale-exercises-banner')).toBeInTheDocument();
    expect(screen.getByTestId('scheduled-template-deleted-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });

  it('removes stale snapshot exercises from recovery modal via scheduled swap mutation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let currentDetail = createScheduledWorkoutDetailPayload({
      date: toDateKey(new Date()),
      staleExercises: [
        {
          exerciseId: 'deleted-exercise',
          snapshotName: 'Dips',
        },
      ],
    });

    fetchSpy.mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/scheduled-workouts/scheduled-1' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: currentDetail }));
      }

      if (url.pathname === '/api/v1/workout-sessions' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (
        url.pathname === '/api/v1/scheduled-workouts/scheduled-1/exercise-swap' &&
        method === 'PATCH'
      ) {
        const payload = JSON.parse(String(init?.body)) as {
          fromExerciseId: string;
          toExerciseId: string | null;
        };

        expect(payload).toEqual({
          fromExerciseId: 'deleted-exercise',
          toExerciseId: null,
        });

        currentDetail = {
          ...currentDetail,
          staleExercises: [],
          updatedAt: currentDetail.updatedAt + 1,
        };

        return Promise.resolve(jsonResponse({ data: currentDetail }));
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <ScheduledWorkoutDetail id="scheduled-1" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([input, requestInit]) =>
            String(input).includes('/api/v1/scheduled-workouts/scheduled-1/exercise-swap') &&
            (requestInit?.method ?? 'GET') === 'PATCH',
        ),
      ).toBe(true);
    });
  });

  it('opens swap flow from stale recovery modal with the correct stale exercise context', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/scheduled-workouts/scheduled-1' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: createScheduledWorkoutDetailPayload({
              date: toDateKey(new Date()),
              staleExercises: [
                {
                  exerciseId: 'deleted-exercise',
                  snapshotName: 'Dips',
                },
              ],
            }),
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-sessions' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <ScheduledWorkoutDetail id="scheduled-1" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));

    const swapDialog = await screen.findByTestId('swap-exercise-dialog');
    expect(swapDialog).toHaveTextContent('Dips');
    expect(swapDialog).toHaveTextContent('deleted-exercise');
  });

  it('opens stale recovery modal when start-session returns STALE_SNAPSHOT_EXERCISES', async () => {
    const todayKey = toDateKey(new Date());

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/scheduled-workouts/scheduled-1' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: createScheduledWorkoutDetailPayload({
              date: todayKey,
              staleExercises: [
                {
                  exerciseId: 'deleted-exercise',
                  snapshotName: 'Dips',
                },
              ],
            }),
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-sessions' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.pathname === '/api/v1/workout-sessions' && method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'STALE_SNAPSHOT_EXERCISES',
                message: 'Scheduled workout snapshot references deleted or unavailable exercises',
                staleExercises: [
                  {
                    exerciseId: 'deleted-exercise',
                    snapshotName: 'Dips',
                  },
                ],
              },
            }),
            {
              headers: {
                'Content-Type': 'application/json',
              },
              status: 409,
            },
          ),
        );
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <ScheduledWorkoutDetail id="scheduled-1" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }));

    expect(
      await screen.findByRole('heading', { name: 'Resolve unavailable exercises' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Dips')).toBeInTheDocument();
  });

  it('starts anyway from stale recovery modal by re-posting session start with force true', async () => {
    const todayKey = toDateKey(new Date());
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/scheduled-workouts/scheduled-1' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: createScheduledWorkoutDetailPayload({
              date: todayKey,
              staleExercises: [
                {
                  exerciseId: 'deleted-exercise',
                  snapshotName: 'Dips',
                },
              ],
            }),
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-sessions' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.pathname === '/api/v1/workout-sessions' && method === 'POST') {
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                id: 'session-1',
                userId: 'user-1',
                templateId: 'template-1',
                name: 'Upper Push',
                date: todayKey,
                status: 'in-progress',
                startedAt: 1,
                completedAt: null,
                duration: null,
                timeSegments: [
                  {
                    start: '2026-03-07T00:00:00.000Z',
                    end: null,
                    section: 'main',
                  },
                ],
                feedback: null,
                notes: null,
                sets: [],
                createdAt: 1,
                updatedAt: 1,
              },
            },
            { status: 201 },
          ),
        );
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <ScheduledWorkoutDetail id="scheduled-1" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start anyway' }));

    await waitFor(() => {
      const startCall = fetchSpy.mock.calls.find(([input, requestInit]) => {
        const requestUrl = String(input);
        const requestMethod = requestInit?.method ?? 'GET';
        return requestUrl.includes('/api/v1/workout-sessions') && requestMethod === 'POST';
      });

      expect(startCall).toBeDefined();
      const requestBody = JSON.parse(String(startCall?.[1]?.body));
      expect(requestBody).toMatchObject({
        force: true,
        scheduledWorkoutId: 'scheduled-1',
      });
    });
  });
});

function createScheduledWorkoutDetailPayload({
  date,
  exercises,
  staleExercises,
  templateDeleted = false,
  templateDrift = null,
}: {
  date: string;
  exercises?: Array<{
    exerciseId: string;
    exerciseName: string;
    section: 'warmup' | 'main' | 'cooldown' | 'supplemental';
    orderIndex: number;
    programmingNotes: string | null;
    agentNotes: string | null;
    agentNotesMeta: {
      author: string;
      generatedAt: string;
      scheduledDateAtGeneration: string;
      stale: boolean;
    } | null;
    templateCues: string[] | null;
    supersetGroup: string | null;
    tempo: string | null;
    restSeconds: number | null;
    sets: Array<{
      setNumber: number;
      repsMin: number | null;
      repsMax: number | null;
      reps: number | null;
      targetWeight: number | null;
      targetWeightMin: number | null;
      targetWeightMax: number | null;
      targetSeconds: number | null;
      targetDistance: number | null;
    }>;
  }>;
  staleExercises?: Array<{
    exerciseId: string;
    snapshotName: string;
  }>;
  templateDeleted?: boolean;
  templateDrift?: {
    changedAt: number;
    summary: string;
  } | null;
}) {
  return {
    id: 'scheduled-1',
    userId: 'user-1',
    templateId: 'template-1',
    date,
    sessionId: null,
    createdAt: 1,
    updatedAt: 1,
    exercises: exercises ?? [
      {
        exerciseId: 'incline-dumbbell-press',
        exerciseName: 'Incline Dumbbell Press',
        section: 'main',
        orderIndex: 0,
        programmingNotes: 'Top set first, then reduce load for back-off sets.',
        agentNotes: null,
        agentNotesMeta: null,
        templateCues: ['Drive feet into the floor', 'Keep wrists stacked'],
        supersetGroup: null,
        tempo: '3110',
        restSeconds: 90,
        sets: [
          {
            setNumber: 1,
            repsMin: 8,
            repsMax: 10,
            reps: null,
            targetWeight: 70,
            targetWeightMin: null,
            targetWeightMax: null,
            targetSeconds: null,
            targetDistance: null,
          },
        ],
      },
    ],
    templateDrift,
    staleExercises: staleExercises ?? [],
    templateDeleted,
    template: templateDeleted
      ? null
      : {
          id: 'template-1',
          userId: 'user-1',
          name: 'Upper Push',
          description: 'Chest, shoulders, and triceps emphasis.',
          tags: ['push'],
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
                  trackingType: 'weight_reps',
                  sets: 3,
                  repsMin: 8,
                  repsMax: 10,
                  tempo: '3110',
                  restSeconds: 90,
                  supersetGroup: null,
                  notes: 'Drive feet into the floor.',
                  cues: ['Drive feet into the floor', 'Keep wrists stacked'],
                  setTargets: [
                    {
                      setNumber: 1,
                      targetWeight: 70,
                    },
                  ],
                  programmingNotes: 'Top set first, then reduce load for back-off sets.',
                  exercise: {
                    formCues: ['Tuck shoulder blades'],
                    coachingNotes: 'Keep your upper back pinned to the bench.',
                    instructions: 'Lower dumbbells with control, then drive straight up.',
                  },
                },
              ],
            },
            {
              type: 'cooldown',
              exercises: [],
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
  };
}
