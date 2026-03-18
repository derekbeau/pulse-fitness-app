import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { MouseEvent, ReactNode } from 'react';
import { BrowserRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import { ExerciseLibrary } from './exercise-library';

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

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">
        {React.isValidElement(children)
          ? React.cloneElement(
              children as React.ReactElement<{ height?: number; width?: number }>,
              {
                height: 320,
                width: 640,
              },
            )
          : children}
      </div>
    ),
  };
});

const exerciseFixtures = [
  {
    id: 'air-bike',
    userId: null,
    name: 'Air Bike',
    muscleGroups: ['conditioning'],
    equipment: 'bike',
    category: 'cardio',
    tags: ['conditioning', 'intervals'],
    instructions: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'banded-shoulder-external-rotation',
    userId: null,
    name: 'Banded Shoulder External Rotation',
    muscleGroups: ['rear delts', 'rotator cuff'],
    equipment: 'resistance band',
    category: 'mobility',
    tags: ['prehab'],
    instructions: 'Keep your elbow pinned and move slowly.',
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'barbell-bench-press',
    userId: null,
    name: 'Barbell Bench Press',
    muscleGroups: ['chest', 'triceps'],
    equipment: 'barbell',
    category: 'compound',
    tags: ['pressing'],
    instructions: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'chest-supported-row',
    userId: null,
    name: 'Chest Supported Row',
    muscleGroups: ['lats', 'upper back'],
    equipment: 'machine',
    category: 'compound',
    tags: ['back'],
    instructions: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'couch-stretch',
    userId: null,
    name: 'Couch Stretch',
    muscleGroups: ['hip flexors', 'quads'],
    equipment: 'bodyweight',
    category: 'mobility',
    tags: ['recovery'],
    instructions: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'goblet-squat',
    userId: null,
    name: 'Goblet Squat',
    muscleGroups: ['quads', 'glutes'],
    equipment: 'dumbbell',
    category: 'compound',
    tags: ['legs'],
    instructions: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'incline-dumbbell-press',
    userId: null,
    name: 'Incline Dumbbell Press',
    muscleGroups: ['upper chest', 'front delts', 'triceps'],
    equipment: 'dumbbells',
    category: 'compound',
    tags: ['upper body', 'push'],
    instructions: 'Drive feet into the floor and keep wrists stacked.',
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'lat-pulldown',
    userId: null,
    name: 'Lat Pulldown',
    muscleGroups: ['lats', 'upper back'],
    equipment: 'cable machine',
    category: 'compound',
    tags: ['pull'],
    instructions: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'leg-extension',
    userId: null,
    name: 'Leg Extension',
    muscleGroups: ['quads'],
    equipment: 'machine',
    category: 'isolation',
    tags: ['accessory'],
    instructions: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'row-erg',
    userId: null,
    name: 'Row Erg',
    muscleGroups: ['conditioning', 'upper back'],
    equipment: 'rower',
    category: 'cardio',
    tags: ['conditioning'],
    instructions: null,
    createdAt: 1,
    updatedAt: 1,
  },
];

beforeEach(() => {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  window.history.pushState({}, '', '/workouts');
});

afterEach(() => {
  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ExerciseLibrary', () => {
  it('filters exercises by case-insensitive name search and syncs q to the URL', async () => {
    mockExerciseRequests();

    renderExerciseLibrary();

    fireEvent.change(screen.getByLabelText('Search exercises'), {
      target: { value: 'ROW' },
    });

    await waitFor(() => {
      expect(window.location.search).toContain('q=ROW');
    });

    expect(await screen.findByRole('heading', { level: 3, name: 'Row Erg' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Chest Supported Row' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Air Bike' })).not.toBeInTheDocument();
  });

  it('filters exercises by muscle group, equipment, and category together', async () => {
    mockExerciseRequests();

    renderExerciseLibrary();

    expect(await screen.findByRole('option', { name: 'Rear Delts' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Resistance Band' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter by muscle group'), {
      target: { value: 'rear delts' },
    });
    await waitFor(() => {
      expect(window.location.search).toContain('muscleGroup=rear+delts');
    });

    fireEvent.change(screen.getByLabelText('Filter by equipment'), {
      target: { value: 'resistance band' },
    });
    await waitFor(() => {
      expect(window.location.search).toContain('equipment=resistance+band');
    });

    fireEvent.change(screen.getByLabelText('Filter by category'), {
      target: { value: 'mobility' },
    });

    await waitFor(() => {
      expect(window.location.search).toContain('category=mobility');
    });

    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'Banded Shoulder External Rotation',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 exercise shown')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 3, name: 'Couch Stretch' }),
    ).not.toBeInTheDocument();
  });

  it('shows paginated results and updates the page query param', async () => {
    mockExerciseRequests();

    renderExerciseLibrary();

    expect(await screen.findByText('10 exercises shown')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(window.location.search).toContain('page=2');
    });

    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Row Erg' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Air Bike' })).not.toBeInTheDocument();
  });

  it('renders exercise tags as muted chips in the library cards', async () => {
    mockExerciseRequests();

    renderExerciseLibrary();

    const pressCard = (await screen.findByRole('heading', {
      level: 3,
      name: 'Incline Dumbbell Press',
    })).closest('[data-slot="card"]');

    expect(pressCard).not.toBeNull();
    expect(within(pressCard as HTMLElement).getByText('Upper Body')).toBeInTheDocument();
    expect(within(pressCard as HTMLElement).getByText('Push')).toBeInTheDocument();
  });

  it('loads trend data from the exercise history API', async () => {
    mockExerciseRequests();

    renderExerciseLibrary();

    fireEvent.click(await screen.findByRole('button', { name: 'Incline Dumbbell Press' }));

    expect(await screen.findByText('Incline Dumbbell Press trends')).toBeInTheDocument();
    expect((await screen.findAllByText(/Latest/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('No history yet')).not.toBeInTheDocument();
  });

  it('renames an exercise from the card actions menu', async () => {
    mockExerciseRequests();

    renderExerciseLibrary();

    const airBikeCard = (await screen.findByRole('heading', { level: 3, name: 'Air Bike' })).closest(
      '[data-slot="card"]',
    );
    expect(airBikeCard).not.toBeNull();

    fireEvent.click(
      within(airBikeCard as HTMLElement).getByRole('button', { name: 'Exercise actions for Air Bike' }),
    );
    fireEvent.click(within(airBikeCard as HTMLElement).getByRole('button', { name: 'Rename' }));

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Exercise name');
    expect(input).toHaveValue('Air Bike');

    fireEvent.change(input, { target: { value: 'Assault Bike' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Assault Bike' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Air Bike' })).not.toBeInTheDocument();
  });

  it('shows an empty state and still supports the exercise trend dialog', async () => {
    mockExerciseRequests();

    renderExerciseLibrary();

    fireEvent.change(screen.getByLabelText('Search exercises'), {
      target: { value: 'does not exist' },
    });

    expect(
      await screen.findByText('No exercises match the current search and filter combination.'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search exercises'), {
      target: { value: 'air bike' },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Air Bike' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Air Bike trends')).toBeInTheDocument();
    expect(screen.getByText('No history yet')).toBeInTheDocument();
  });

  it('falls back to the no-results state when the exercises request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

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

      if (url.pathname === '/api/v1/exercises') {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                code: 'UPSTREAM_ERROR',
                message: 'API unavailable',
              },
            },
            { status: 500 },
          ),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderExerciseLibrary();

    expect(
      await screen.findByText(
        'No exercises match the current search and filter combination.',
        undefined,
        {
          timeout: 4_000,
        },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Unable to load exercises right now.')).not.toBeInTheDocument();
  });
});

function renderExerciseLibrary() {
  return renderWithQueryClient(
    <BrowserRouter>
      <ExerciseLibrary />
    </BrowserRouter>,
  );
}

function mockExerciseRequests() {
  const mockExercises = exerciseFixtures.map((exercise) => ({ ...exercise }));
  const historyByExerciseId: Record<string, unknown[]> = {
    'incline-dumbbell-press': [
      {
        sessionId: 'session-1',
        date: '2026-03-08',
        notes: null,
        sets: [
          { setNumber: 1, reps: 10, weight: 70 },
          { setNumber: 2, reps: 9, weight: 70 },
        ],
      },
      {
        sessionId: 'session-2',
        date: '2026-03-04',
        notes: null,
        sets: [{ setNumber: 1, reps: 8, weight: 65 }],
      },
    ],
  };

  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input), 'https://pulse.test');

    if (url.pathname === '/api/v1/exercises/filters') {
      return Promise.resolve(
        jsonResponse({
          data: {
            muscleGroups: Array.from(
              new Set(mockExercises.flatMap((exercise) => exercise.muscleGroups)),
            ).sort(),
            equipment: Array.from(
              new Set(mockExercises.map((exercise) => exercise.equipment)),
            ).sort(),
          },
        }),
      );
    }

    if (url.pathname.startsWith('/api/v1/exercises/') && init?.method === 'PATCH') {
      const exerciseId = url.pathname.split('/').at(-1);
      const exercise = mockExercises.find((item) => item.id === exerciseId);
      const body = JSON.parse(String(init.body ?? '{}')) as { name?: string };

      if (!exercise || !body.name) {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                code: 'EXERCISE_NOT_FOUND',
                message: 'Exercise not found',
              },
            },
            { status: 404 },
          ),
        );
      }

      exercise.name = body.name;
      exercise.updatedAt = exercise.updatedAt + 1;

      return Promise.resolve(
        jsonResponse({
          data: exercise,
        }),
      );
    }

    if (url.pathname.startsWith('/api/v1/exercises/') && url.pathname.endsWith('/history')) {
      const exerciseId = url.pathname.split('/')[4] ?? '';

      return Promise.resolve(
        jsonResponse({
          data: historyByExerciseId[exerciseId] ?? [],
        }),
      );
    }

    if (url.pathname !== '/api/v1/exercises') {
      throw new Error(`Unhandled request: ${url.pathname}`);
    }

    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const muscleGroup = url.searchParams.get('muscleGroup')?.toLowerCase();
    const equipment = url.searchParams.get('equipment')?.toLowerCase();
    const category = url.searchParams.get('category');
    const page = Number(url.searchParams.get('page') ?? '1');
    const limit = Number(url.searchParams.get('limit') ?? '20');

    const filteredExercises = [...mockExercises]
      .filter((exercise) => (q ? exercise.name.toLowerCase().includes(q) : true))
      .filter((exercise) =>
        muscleGroup
          ? exercise.muscleGroups.some((group) => group.toLowerCase() === muscleGroup)
          : true,
      )
      .filter((exercise) => (equipment ? exercise.equipment.toLowerCase() === equipment : true))
      .filter((exercise) => (category ? exercise.category === category : true))
      .sort((left, right) => left.name.localeCompare(right.name));

    const offset = (page - 1) * limit;

    return Promise.resolve(
      jsonResponse({
        data: filteredExercises.slice(offset, offset + limit),
        meta: {
          limit,
          page,
          total: filteredExercises.length,
        },
      }),
    );
  });
}
