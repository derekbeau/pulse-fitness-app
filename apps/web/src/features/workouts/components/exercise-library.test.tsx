import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { MouseEvent, ReactNode } from 'react';
import { BrowserRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import { ExerciseLibrary } from './exercise-library';

const EXERCISE_LIBRARY_VIEW_STORAGE_KEY = 'exercise-library-view';

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

const baseExerciseFixtures = [
  {
    id: 'air-bike',
    userId: null,
    name: 'Air Bike',
    muscleGroups: ['conditioning'],
    equipment: 'bike',
    category: 'cardio',
    trackingType: 'cardio',
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
    trackingType: 'weight_reps',
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
    trackingType: 'weight_reps',
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
    trackingType: 'weight_reps',
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
    trackingType: 'weight_reps',
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
    trackingType: 'weight_reps',
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
    trackingType: 'weight_reps',
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
    trackingType: 'weight_reps',
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
    trackingType: 'weight_reps',
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
    trackingType: 'cardio',
    tags: ['conditioning'],
    instructions: null,
    createdAt: 1,
    updatedAt: 1,
  },
];

const generatedExerciseFixtures = Array.from({ length: 20 }, (_, index) => ({
  id: `zz-generated-${index + 1}`,
  userId: null,
  name: `ZZ Generated Exercise ${String(index + 1).padStart(2, '0')}`,
  muscleGroups: ['full body'],
  equipment: 'machine',
  category: 'compound',
  trackingType: 'weight_reps',
  tags: [],
  instructions: null,
  createdAt: 1,
  updatedAt: 1,
}));

const exerciseFixtures = [...baseExerciseFixtures, ...generatedExerciseFixtures];

beforeEach(() => {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  window.history.pushState({}, '', '/workouts');
});

afterEach(() => {
  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(EXERCISE_LIBRARY_VIEW_STORAGE_KEY);
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
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: 'Air Bike' })).not.toBeInTheDocument();
    });
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

    expect(
      await screen.findByText(`${exerciseFixtures.length} exercises shown`),
    ).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(window.location.search).toContain('page=2');
    });

    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'ZZ Generated Exercise 20' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Air Bike' })).not.toBeInTheDocument();
  });

  it('toggles between card and table layouts', async () => {
    mockExerciseRequests();

    renderExerciseLibrary();

    expect(await screen.findByRole('heading', { level: 3, name: 'Air Bike' })).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Exercise library table view' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));

    expect(
      await screen.findByRole('table', { name: 'Exercise library table view' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Tracking Type' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Air Bike' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Card view' }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Air Bike' })).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Exercise library table view' }),
    ).not.toBeInTheDocument();
  });

  it('renders a table skeleton while loading when table view is selected', async () => {
    window.localStorage.setItem(EXERCISE_LIBRARY_VIEW_STORAGE_KEY, 'table');

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
        return new Promise(() => {
          // Keep the request pending to assert loading state.
        });
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderExerciseLibrary();

    expect(await screen.findByLabelText('Loading exercises table view')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Tracking Type' })).toBeInTheDocument();
  });

  it('opens the trend dialog from the exercise name button in table view', async () => {
    mockExerciseRequests();

    renderExerciseLibrary();

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    await screen.findByRole('table', { name: 'Exercise library table view' });

    fireEvent.click(screen.getByRole('button', { name: 'Air Bike' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add to template' })).toBeInTheDocument();
  });

  it('does not write the initial view preference to localStorage on mount', async () => {
    mockExerciseRequests();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    renderExerciseLibrary();
    await screen.findByRole('heading', { level: 3, name: 'Air Bike' });

    expect(setItemSpy).not.toHaveBeenCalledWith(EXERCISE_LIBRARY_VIEW_STORAGE_KEY, 'card');
    expect(setItemSpy).not.toHaveBeenCalledWith(EXERCISE_LIBRARY_VIEW_STORAGE_KEY, 'table');
  });

  it('persists the selected view in localStorage', async () => {
    mockExerciseRequests();

    const firstRender = renderExerciseLibrary();
    await screen.findByRole('heading', { level: 3, name: 'Air Bike' });

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));

    expect(
      await screen.findByRole('table', { name: 'Exercise library table view' }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(EXERCISE_LIBRARY_VIEW_STORAGE_KEY)).toBe('table');

    firstRender.unmount();

    renderExerciseLibrary();

    expect(
      await screen.findByRole('table', { name: 'Exercise library table view' }),
    ).toBeInTheDocument();
  });

  it('renders exercise tags as muted chips in the library cards', async () => {
    mockExerciseRequests();

    renderExerciseLibrary();

    const pressCard = (
      await screen.findByRole('heading', {
        level: 3,
        name: 'Incline Dumbbell Press',
      })
    ).closest('[data-slot="card"]');

    expect(pressCard).not.toBeNull();
    expect(within(pressCard as HTMLElement).getByText('Upper Body')).toBeInTheDocument();
    expect(within(pressCard as HTMLElement).getByText('Push')).toBeInTheDocument();
  });

  it('loads trend data from the exercise history API', async () => {
    mockExerciseRequests();

    renderExerciseLibrary();

    fireEvent.click(await screen.findByRole('button', { name: 'Incline Dumbbell Press' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'History' }));
    expect(await within(dialog).findByText('Mar 8, 2026 · 70x10, 70x9')).toBeInTheDocument();
    expect(within(dialog).queryByText('No history yet')).not.toBeInTheDocument();
  });

  it('renames an exercise from the card actions menu', async () => {
    mockExerciseRequests();

    renderExerciseLibrary();

    const airBikeCard = (
      await screen.findByRole('heading', { level: 3, name: 'Air Bike' })
    ).closest('[data-slot="card"]');
    expect(airBikeCard).not.toBeNull();

    fireEvent.click(
      within(airBikeCard as HTMLElement).getByRole('button', {
        name: 'Exercise actions for Air Bike',
      }),
    );
    fireEvent.click(within(airBikeCard as HTMLElement).getByRole('button', { name: 'Rename' }));

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Exercise name');
    expect(input).toHaveValue('Air Bike');

    fireEvent.change(input, { target: { value: 'Assault Bike' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Assault Bike' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Air Bike' })).not.toBeInTheDocument();
  });

  it('shows an empty state and still supports the unified exercise detail modal', async () => {
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

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'History' }));
    expect(await within(dialog).findByText('No completed history yet.')).toBeInTheDocument();
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

    if (url.pathname.startsWith('/api/v1/exercises/') && !url.pathname.endsWith('/history')) {
      const exerciseId = url.pathname.split('/').at(-1) ?? '';
      const exercise = mockExercises.find((item) => item.id === exerciseId);

      if (!exercise) {
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

      return Promise.resolve(
        jsonResponse({
          data: {
            ...exercise,
            coachingNotes: null,
            formCues: [],
            relatedExerciseIds: [],
          },
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
    const limit = Number(url.searchParams.get('limit') ?? '25');

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
