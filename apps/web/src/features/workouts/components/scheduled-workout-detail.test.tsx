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

import { ScheduledWorkoutDetail } from './scheduled-workout-detail';

beforeEach(() => {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
});

afterEach(() => {
  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  vi.restoreAllMocks();
});

describe('ScheduledWorkoutDetail', () => {
  it('renders shared workout exercise cards and programming notes from scheduled template data', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/scheduled-workouts/scheduled-1' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: createScheduledWorkoutDetailPayload({ date: toDateKey(new Date()) }),
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

    expect(await screen.findByRole('heading', { level: 1, name: 'Upper Push' })).toBeInTheDocument();
    expect(screen.getByTestId('workout-exercise-card-template-exercise-1')).toBeInTheDocument();
    expect(screen.getByText('Programming notes')).toBeInTheDocument();
    expect(screen.getByText('Top set first, then reduce load for back-off sets.')).toBeInTheDocument();
    expect(screen.getByText('Show full set detail')).toBeInTheDocument();

    expect(
      fetchSpy.mock.calls.some(
        ([input, requestInit]) =>
          String(input).includes('/api/v1/scheduled-workouts/scheduled-1') &&
          (requestInit?.method ?? 'GET') === 'GET',
      ),
    ).toBe(true);
  });

  it('starts the scheduled workout via the start-session mutation', async () => {
    const todayKey = toDateKey(new Date());
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/scheduled-workouts/scheduled-1' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: createScheduledWorkoutDetailPayload({ date: todayKey }),
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

    fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }));

    await waitFor(() => {
      const startCall = fetchSpy.mock.calls.find(([input, requestInit]) => {
        const requestUrl = String(input);
        const requestMethod = requestInit?.method ?? 'GET';
        return requestUrl.includes('/api/v1/workout-sessions') && requestMethod === 'POST';
      });

      expect(startCall).toBeDefined();
    });

    const startCall = fetchSpy.mock.calls.find(([input, requestInit]) => {
      const requestUrl = String(input);
      const requestMethod = requestInit?.method ?? 'GET';
      return requestUrl.includes('/api/v1/workout-sessions') && requestMethod === 'POST';
    });

    const requestBody = JSON.parse(String(startCall?.[1]?.body));
    expect(requestBody).toMatchObject({
      name: 'Upper Push',
      templateId: 'template-1',
    });
  });

  it('keeps reschedule and cancel affordances wired to scheduled-workout mutations', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/scheduled-workouts/scheduled-1' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: createScheduledWorkoutDetailPayload({ date: toDateKey(new Date()) }),
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-sessions' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.pathname === '/api/v1/scheduled-workouts/scheduled-1' && method === 'PATCH') {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'scheduled-1',
              userId: 'user-1',
              templateId: 'template-1',
              date: '2099-12-31',
              sessionId: null,
              createdAt: 1,
              updatedAt: 2,
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/scheduled-workouts/scheduled-1' && method === 'DELETE') {
        return Promise.resolve(
          jsonResponse({
            data: {
              success: true,
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <ScheduledWorkoutDetail id="scheduled-1" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit reschedule' }));

    await waitFor(() => {
      const rescheduleCall = fetchSpy.mock.calls.find(([input, requestInit]) => {
        const requestUrl = String(input);
        const requestMethod = requestInit?.method ?? 'GET';
        return (
          requestUrl.includes('/api/v1/scheduled-workouts/scheduled-1') &&
          requestMethod === 'PATCH'
        );
      });

      expect(rescheduleCall).toBeDefined();
    });

    const rescheduleCall = fetchSpy.mock.calls.find(([input, requestInit]) => {
      const requestUrl = String(input);
      const requestMethod = requestInit?.method ?? 'GET';
      return requestUrl.includes('/api/v1/scheduled-workouts/scheduled-1') && requestMethod === 'PATCH';
    });
    const rescheduleBody = JSON.parse(String(rescheduleCall?.[1]?.body));
    expect(rescheduleBody).toEqual({ date: '2099-12-31' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel workout' }));

    await waitFor(() => {
      const cancelCall = fetchSpy.mock.calls.find(([input, requestInit]) => {
        const requestUrl = String(input);
        const requestMethod = requestInit?.method ?? 'GET';
        return (
          requestUrl.includes('/api/v1/scheduled-workouts/scheduled-1') &&
          requestMethod === 'DELETE'
        );
      });

      expect(cancelCall).toBeDefined();
    });
  });
});

function createScheduledWorkoutDetailPayload({
  date,
}: {
  date: string;
}): {
  id: string;
  userId: string;
  templateId: string;
  date: string;
  sessionId: null;
  createdAt: number;
  updatedAt: number;
  template: {
    id: string;
    userId: string;
    name: string;
    description: string;
    tags: string[];
    sections: Array<{
      type: 'warmup' | 'main' | 'cooldown';
      exercises: Array<{
        id: string;
        exerciseId: string;
        exerciseName: string;
        trackingType: 'weight_reps';
        sets: number;
        repsMin: number;
        repsMax: number;
        tempo: '3110';
        restSeconds: number;
        supersetGroup: null;
        notes: string;
        cues: string[];
        setTargets: Array<{
          setNumber: number;
          targetWeight: number;
        }>;
        programmingNotes: string;
        exercise: {
          formCues: string[];
          coachingNotes: string;
          instructions: string;
        };
      }>;
    }>;
    createdAt: number;
    updatedAt: number;
  };
} {
  return {
    id: 'scheduled-1',
    userId: 'user-1',
    templateId: 'template-1',
    date,
    sessionId: null,
    createdAt: 1,
    updatedAt: 1,
    template: {
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
