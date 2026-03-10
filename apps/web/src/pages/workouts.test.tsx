import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import {
  WORKOUT_SESSION_COMPLETED_NOTICE,
  WORKOUT_SESSION_NOTICE_QUERY_KEY,
} from '@/features/workouts/lib/session-persistence';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';
import { WorkoutsPage } from './workouts';

const templatesResponse = [
  {
    id: 'upper-push',
    userId: 'user-1',
    name: 'Upper Push',
    description: 'Chest, shoulders, and triceps emphasis.',
    tags: ['push', 'upper-body'],
    sections: [
      {
        type: 'warmup',
        exercises: [
          {
            id: 'upper-push-warmup-1',
            exerciseId: 'row-erg',
            exerciseName: 'Row Erg',
            sets: 1,
            repsMin: 6,
            repsMax: 8,
            tempo: null,
            restSeconds: 60,
            supersetGroup: null,
            notes: null,
            cues: ['Build heat before pressing'],
          },
        ],
      },
      {
        type: 'main',
        exercises: [
          {
            id: 'upper-push-main-1',
            exerciseId: 'incline-dumbbell-press',
            exerciseName: 'Incline Dumbbell Press',
            sets: 3,
            repsMin: 8,
            repsMax: 10,
            tempo: null,
            restSeconds: 90,
            supersetGroup: null,
            notes: null,
            cues: ['Keep elbows stacked'],
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
  {
    id: 'lower-quad-dominant',
    userId: 'user-1',
    name: 'Lower Quad-Dominant',
    description: 'Quad-focused lower session.',
    tags: ['legs', 'strength'],
    sections: [
      {
        type: 'warmup',
        exercises: [],
      },
      {
        type: 'main',
        exercises: [
          {
            id: 'lower-main-1',
            exerciseId: 'high-bar-back-squat',
            exerciseName: 'High-Bar Back Squat',
            sets: 4,
            repsMin: 5,
            repsMax: 8,
            tempo: null,
            restSeconds: 120,
            supersetGroup: null,
            notes: null,
            cues: ['Drive knees out'],
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
];

describe('WorkoutsPage', () => {
  beforeEach(() => {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/exercises') {
        return Promise.resolve(
          jsonResponse({
            data: [],
            meta: {
              page: Number(url.searchParams.get('page') ?? '1'),
              limit: Number(url.searchParams.get('limit') ?? '8'),
              total: 0,
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/exercises/filters') {
        return Promise.resolve(
          jsonResponse({
            data: {
              equipment: [],
              muscleGroups: [],
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-templates') {
        return Promise.resolve(
          jsonResponse({
            data: templatesResponse,
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });
  });

  afterEach(() => {
    window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('switches between the workouts views', async () => {
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Workouts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calendar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Workout Calendar')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'List' }));

    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Workout Calendar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Templates' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exercises' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Exercise Library' })).toBeInTheDocument();
  });

  it('opens template detail when selecting a template card from the templates view', async () => {
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
          <Route element={<TemplateRouteProbe />} path="/workouts/template/:templateId" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Lower Quad-Dominant' }));

    expect(
      await screen.findByRole('heading', { name: 'Template lower-quad-dominant' }),
    ).toBeInTheDocument();
  });

  it('filters templates by name with the search input', async () => {
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));

    const searchbox = await screen.findByRole('searchbox', { name: /search templates by name/i });
    expect(searchbox).toHaveAttribute(
      'id',
      'template-search',
    );
    expect(await screen.findByRole('link', { name: 'Upper Push' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Lower Quad-Dominant' })).toBeInTheDocument();

    fireEvent.change(searchbox, {
      target: { value: 'upper' },
    });

    expect(screen.getByRole('link', { name: 'Upper Push' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lower Quad-Dominant' })).not.toBeInTheDocument();
  });

  it('shows workout card skeletons while templates are loading', async () => {
    const deferredTemplates = createDeferredResponse();

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-templates') {
        return deferredTemplates.promise;
      }

      if (url.pathname === '/api/v1/exercises') {
        return Promise.resolve(
          jsonResponse({
            data: [],
            meta: {
              page: Number(url.searchParams.get('page') ?? '1'),
              limit: Number(url.searchParams.get('limit') ?? '8'),
              total: 0,
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/exercises/filters') {
        return Promise.resolve(
          jsonResponse({
            data: {
              equipment: [],
              muscleGroups: [],
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));

    expect(screen.getByLabelText('Loading workout templates')).toBeInTheDocument();
    expect(screen.getAllByTestId('workout-card-skeleton')).toHaveLength(4);

    deferredTemplates.resolve(jsonResponse({ data: templatesResponse }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Templates' })).toBeInTheDocument();
  });

  it('shows a completion notice when redirected from an already-completed active session', () => {
    renderWithQueryClient(
      <MemoryRouter
        initialEntries={[`/workouts?${WORKOUT_SESSION_NOTICE_QUERY_KEY}=${WORKOUT_SESSION_COMPLETED_NOTICE}`]}
      >
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Session was completed on another device.')).toBeInTheDocument();
  });
});

function TemplateRouteProbe() {
  const { templateId } = useParams();

  return <h1>{`Template ${templateId}`}</h1>;
}

function createDeferredResponse() {
  let resolve: (value: Response) => void = () => {};

  const promise = new Promise<Response>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}
