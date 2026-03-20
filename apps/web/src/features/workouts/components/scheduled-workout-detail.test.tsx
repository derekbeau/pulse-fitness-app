import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import { ScheduledWorkoutDetail } from './scheduled-workout-detail';

beforeEach(() => {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
});

afterEach(() => {
  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  vi.restoreAllMocks();
});

describe('ScheduledWorkoutDetail', () => {
  it('opens and closes exercise history modal from planned workout rows', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/scheduled-workouts/scheduled-1') {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'scheduled-1',
              userId: 'user-1',
              templateId: 'template-1',
              date: '2026-03-18',
              sessionId: null,
              createdAt: 1,
              updatedAt: 1,
              template: {
                id: 'template-1',
                userId: 'user-1',
                name: 'Upper Push',
                description: null,
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
                        tempo: null,
                        restSeconds: 90,
                        supersetGroup: null,
                        notes: null,
                        cues: [],
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
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(
          jsonResponse({
            data: [],
          }),
        );
      }

      if (url.pathname === '/api/v1/exercises/incline-dumbbell-press') {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'incline-dumbbell-press',
              userId: 'user-1',
              name: 'Incline Dumbbell Press',
              muscleGroups: ['upper chest', 'triceps'],
              equipment: 'Dumbbells',
              category: 'compound',
              trackingType: 'weight_reps',
              tags: [],
              formCues: ['Tuck shoulder blades'],
              instructions: 'Lower with control and drive up.',
              coachingNotes: 'Keep your upper back pinned.',
              relatedExerciseIds: [],
              createdAt: 1,
              updatedAt: 1,
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/exercises/incline-dumbbell-press/history') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                sessionId: 'session-1',
                date: '2026-03-12',
                notes: null,
                sets: [
                  { setNumber: 1, reps: 10, weight: 70 },
                  { setNumber: 2, reps: 9, weight: 70 },
                ],
              },
            ],
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <ScheduledWorkoutDetail id="scheduled-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Upper Push')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Incline Dumbbell Press history' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'History' }));
    expect(await within(dialog).findByText('Mar 12, 2026 · 70x10, 70x9')).toBeInTheDocument();

    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0] as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByText('Mar 12, 2026 · 70x10, 70x9')).not.toBeInTheDocument();
    });
  });
});
