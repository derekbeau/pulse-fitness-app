import { fireEvent, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import { ExerciseLibrary } from './exercise-library';

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
    instructions: null,
    createdAt: 1,
    updatedAt: 1,
  },
];

beforeEach(() => {
  window.history.pushState({}, '', '/workouts');
});

afterEach(() => {
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
});

function renderExerciseLibrary() {
  return renderWithQueryClient(
    <BrowserRouter>
      <ExerciseLibrary />
    </BrowserRouter>,
  );
}

function mockExerciseRequests() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = new URL(String(input), 'https://pulse.test');

    if (url.pathname !== '/api/v1/exercises') {
      throw new Error(`Unhandled request: ${url.pathname}`);
    }

    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const muscleGroup = url.searchParams.get('muscleGroup')?.toLowerCase();
    const equipment = url.searchParams.get('equipment')?.toLowerCase();
    const category = url.searchParams.get('category');
    const page = Number(url.searchParams.get('page') ?? '1');
    const limit = Number(url.searchParams.get('limit') ?? '20');

    const filteredExercises = [...exerciseFixtures]
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
