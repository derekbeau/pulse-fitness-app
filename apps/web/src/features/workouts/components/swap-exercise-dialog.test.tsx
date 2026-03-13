import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import { SwapExerciseDialog } from './swap-exercise-dialog';

describe('SwapExerciseDialog', () => {
  beforeEach(() => {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  });

  afterEach(() => {
    window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('surfaces related exercises first and filters search results', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
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
                muscleGroups: ['legs'],
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
              {
                id: 'incline-dumbbell-press',
                userId: 'user-1',
                name: 'Incline Dumbbell Press',
                muscleGroups: ['chest'],
                equipment: 'Dumbbells',
                category: 'compound',
                trackingType: 'weight_reps',
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
              total: 3,
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <SwapExerciseDialog
        contextId="template-1"
        mode="template"
        onOpenChange={vi.fn()}
        open
        sourceExerciseId="row-erg"
        sourceExerciseName="Row Erg"
        sourceLabel="this template"
      />,
    );

    const dialog = await screen.findByRole('dialog');
    const relatedTitle = await within(dialog).findByText('Related exercises');
    const allTitle = await within(dialog).findByText('All exercises');
    const relatedSection = relatedTitle.closest('div');
    const allSection = allTitle.closest('div');

    expect(relatedSection).not.toBeNull();
    expect(allSection).not.toBeNull();
    expect(within(relatedSection as HTMLElement).getByText('Assault Bike')).toBeInTheDocument();
    expect(
      within(allSection as HTMLElement).getByText('Incline Dumbbell Press'),
    ).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Search exercises'), {
      target: { value: 'incline' },
    });

    expect(within(dialog).queryByText('Assault Bike')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Incline Dumbbell Press')).toBeInTheDocument();
  });

  it('calls swap API when an exercise is selected', async () => {
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
                muscleGroups: ['legs'],
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
        url.pathname === '/api/v1/workout-templates/template-1/exercises/row-erg/swap' &&
        init?.method === 'PATCH'
      ) {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'template-1',
              userId: 'user-1',
              name: 'Template',
              description: null,
              tags: [],
              sections: [
                {
                  type: 'warmup',
                  exercises: [
                    {
                      id: 'template-row',
                      exerciseId: 'assault-bike',
                      exerciseName: 'Assault Bike',
                      trackingType: 'seconds_only',
                      sets: 1,
                      repsMin: 30,
                      repsMax: 30,
                      tempo: null,
                      restSeconds: 0,
                      supersetGroup: null,
                      notes: null,
                      cues: [],
                    },
                  ],
                },
                {
                  type: 'main',
                  exercises: [],
                },
                {
                  type: 'cooldown',
                  exercises: [],
                },
              ],
              createdAt: 1,
              updatedAt: 2,
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <SwapExerciseDialog
        contextId="template-1"
        mode="template"
        onOpenChange={vi.fn()}
        open
        sourceExerciseId="row-erg"
        sourceExerciseName="Row Erg"
        sourceLabel="this template"
      />,
    );

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: /Assault Bike/i }));

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([input, init]) =>
            String(input).includes('/api/v1/workout-templates/template-1/exercises/row-erg/swap') &&
            init?.method === 'PATCH',
        ),
      ).toBe(true);
    });
  });
});
