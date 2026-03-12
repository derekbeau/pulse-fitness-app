import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { MouseEvent, ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { ACTIVE_WORKOUT_SESSION_STORAGE_KEY } from '@/features/workouts/lib/session-persistence';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import { WorkoutTemplateDetail } from './template-detail';

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

const templatePayload = {
  data: {
    id: 'upper-push',
    userId: 'user-1',
    name: 'Upper Push',
    description: 'Chest, shoulders, and triceps emphasis with controlled tempo work.',
    tags: ['upper body', 'push'],
    sections: [
      {
        type: 'warmup',
        exercises: [
          {
            id: 'template-exercise-row-erg',
            exerciseId: 'row-erg',
            exerciseName: 'Row Erg',
            sets: 1,
            repsMin: 240,
            repsMax: 240,
            tempo: null,
            restSeconds: 0,
            supersetGroup: null,
            notes: null,
            formCues: ['Keep cadence steady'],
            cues: ['Build heat before pressing'],
          },
        ],
      },
      {
        type: 'main',
        exercises: [
          {
            id: 'template-exercise-incline',
            exerciseId: 'incline-dumbbell-press',
            exerciseName: 'Incline Dumbbell Press',
            sets: 3,
            repsMin: 8,
            repsMax: 10,
            tempo: '3110',
            restSeconds: 90,
            supersetGroup: null,
            notes: 'Drive feet into the floor.',
            formCues: ['Tuck shoulder blades'],
            cues: ['Drive feet into the floor', 'Keep wrists stacked'],
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

const createdSessionPayload = {
  data: {
    id: 'session-1',
    userId: 'user-1',
    templateId: 'upper-push',
    name: 'Upper Push',
    date: '2026-03-07',
    status: 'in-progress',
    startedAt: 1,
    completedAt: null,
    duration: null,
    timeSegments: [
      {
        start: '2026-03-07T00:00:00.000Z',
        end: null,
      },
    ],
    feedback: null,
    notes: null,
    sets: [],
    createdAt: 1,
    updatedAt: 1,
  },
};

beforeEach(() => {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
});

afterEach(() => {
  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY);
  vi.restoreAllMocks();
});

describe('WorkoutTemplateDetail', () => {
  it('renders the selected template with real API data and exercise metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith('/api/v1/workout-templates/upper-push')) {
        return Promise.resolve(jsonResponse(templatePayload));
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="upper-push" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Upper Push' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Chest, shoulders, and triceps emphasis with controlled tempo work.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Upper Body')).toBeInTheDocument();

    const warmupSection = screen
      .getByRole('heading', { level: 2, name: 'Warmup' })
      .closest('details');
    const mainSection = screen.getByRole('heading', { level: 2, name: 'Main' }).closest('details');
    const cooldownSection = screen
      .getByRole('heading', { level: 2, name: 'Cooldown' })
      .closest('details');

    expect(warmupSection).not.toHaveAttribute('open');
    expect(mainSection).toHaveAttribute('open');
    expect(cooldownSection).not.toHaveAttribute('open');

    const inclinePressCard = screen
      .getByText('Incline Dumbbell Press')
      .closest('[data-slot="card"]');

    expect(inclinePressCard).not.toBeNull();
    expect(within(inclinePressCard as HTMLElement).getByText('3 x 8-10')).toBeInTheDocument();
    expect(within(inclinePressCard as HTMLElement).getByText('Tempo: 3-1-1-0')).toBeInTheDocument();
    expect(within(inclinePressCard as HTMLElement).getByText('Rest: 90s')).toBeInTheDocument();
    expect(
      within(inclinePressCard as HTMLElement).getByText('Drive feet into the floor.'),
    ).toBeInTheDocument();

    expect(within(inclinePressCard as HTMLElement).getByText('Exercise cues')).toBeInTheDocument();
    expect(within(inclinePressCard as HTMLElement).getByText('Template cues')).toBeInTheDocument();
    expect(
      within(inclinePressCard as HTMLElement).getByText('Tuck shoulder blades'),
    ).toBeInTheDocument();
    expect(
      within(inclinePressCard as HTMLElement).getByText('Keep wrists stacked'),
    ).toBeInTheDocument();
  });

  it('creates a workout session before navigating to the active workout page', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);

      if (url.endsWith('/api/v1/workout-templates/upper-push')) {
        return Promise.resolve(jsonResponse(templatePayload));
      }

      if (url.endsWith('/api/v1/workout-sessions') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(createdSessionPayload, { status: 201 }));
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts/template/upper-push']}>
        <Routes>
          <Route
            element={<WorkoutTemplateDetail templateId="upper-push" />}
            path="/workouts/template/upper-push"
          />
          <Route element={<p>Active workout page</p>} path="/workouts/active" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Workout' }));

    await waitFor(() => {
      expect(screen.getByText('Active workout page')).toBeInTheDocument();
    });

    const createSessionCall = fetchSpy.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/api/v1/workout-sessions') && init?.method === 'POST',
    );

    expect(createSessionCall).toBeDefined();

    const requestBody = JSON.parse(String(createSessionCall?.[1]?.body));

    expect(requestBody).toMatchObject({
      name: 'Upper Push',
      templateId: 'upper-push',
    });
    expect(requestBody.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(requestBody.startedAt).toEqual(expect.any(Number));
    expect(requestBody.sets).toHaveLength(4);
    expect(requestBody.sets).toEqual([
      expect.objectContaining({
        exerciseId: 'row-erg',
        orderIndex: 0,
        reps: null,
        section: 'warmup',
        setNumber: 1,
        weight: null,
      }),
      expect.objectContaining({
        exerciseId: 'incline-dumbbell-press',
        orderIndex: 0,
        reps: null,
        section: 'main',
        setNumber: 1,
        weight: null,
      }),
      expect.objectContaining({
        exerciseId: 'incline-dumbbell-press',
        orderIndex: 0,
        reps: null,
        section: 'main',
        setNumber: 2,
        weight: null,
      }),
      expect.objectContaining({
        exerciseId: 'incline-dumbbell-press',
        orderIndex: 0,
        reps: null,
        section: 'main',
        setNumber: 3,
        weight: null,
      }),
    ]);
    expect(window.localStorage.getItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY)).toBe('session-1');
  });

  it('renames an exercise from the template exercise menu', async () => {
    const mutableTemplate = structuredClone(templatePayload);
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-templates/upper-push') {
        return Promise.resolve(jsonResponse(mutableTemplate));
      }

      if (url.pathname === '/api/v1/exercises/incline-dumbbell-press' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body ?? '{}')) as { name?: string };
        const nextName = body.name ?? '';

        mutableTemplate.data.sections[1].exercises[0].exerciseName = nextName;

        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'incline-dumbbell-press',
              userId: 'user-1',
              name: nextName,
              muscleGroups: ['upper chest', 'front delts', 'triceps'],
              equipment: 'dumbbells',
              category: 'compound',
              trackingType: 'weight_reps',
              tags: [],
              formCues: [],
              instructions: null,
              createdAt: 1,
              updatedAt: 2,
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="upper-push" />
      </MemoryRouter>,
    );

    const exerciseCard = (await screen.findByText('Incline Dumbbell Press')).closest(
      '[data-slot="card"]',
    );
    expect(exerciseCard).not.toBeNull();

    fireEvent.click(
      within(exerciseCard as HTMLElement).getByRole('button', {
        name: 'Exercise actions for Incline Dumbbell Press',
      }),
    );
    fireEvent.click(
      within(exerciseCard as HTMLElement).getByRole('button', { name: 'Rename exercise' }),
    );

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Exercise name');
    fireEvent.change(input, { target: { value: 'Incline DB Press' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(await screen.findByText('Incline DB Press')).toBeInTheDocument();
    expect(screen.queryByText('Incline Dumbbell Press')).not.toBeInTheDocument();
  });

  it('moves template exercises down from the exercise menu and calls reorder endpoint', async () => {
    const mutableTemplate = structuredClone(templatePayload);
    const mainExercises = mutableTemplate.data.sections[1].exercises as Array<
      (typeof mutableTemplate.data.sections)[number]['exercises'][number]
    >;
    mainExercises.push({
      id: 'template-exercise-shoulder-press',
      exerciseId: 'seated-dumbbell-shoulder-press',
      exerciseName: 'Seated Dumbbell Shoulder Press',
      sets: 3,
      repsMin: 8,
      repsMax: 10,
      tempo: null,
      restSeconds: 90,
      supersetGroup: null,
      notes: null,
      formCues: [],
      cues: [],
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-templates/upper-push') {
        return Promise.resolve(jsonResponse(mutableTemplate));
      }

      if (
        url.pathname === '/api/v1/workout-templates/upper-push/reorder' &&
        init?.method === 'PATCH'
      ) {
        return Promise.resolve(jsonResponse(mutableTemplate));
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="upper-push" />
      </MemoryRouter>,
    );

    const inclineCard = (await screen.findByText('Incline Dumbbell Press')).closest(
      '[data-slot="card"]',
    );
    expect(inclineCard).not.toBeNull();

    fireEvent.click(
      within(inclineCard as HTMLElement).getByRole('button', {
        name: 'Exercise actions for Incline Dumbbell Press',
      }),
    );
    fireEvent.click(within(inclineCard as HTMLElement).getByRole('button', { name: 'Move down' }));

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([input, init]) =>
            String(input).includes('/api/v1/workout-templates/upper-push/reorder') &&
            init?.method === 'PATCH',
        ),
      ).toBe(true);
    });

    const reorderCall = fetchSpy.mock.calls.find(
      ([input, init]) =>
        String(input).includes('/api/v1/workout-templates/upper-push/reorder') &&
        init?.method === 'PATCH',
    );
    expect(JSON.parse(String(reorderCall?.[1]?.body))).toEqual({
      section: 'main',
      exerciseIds: ['template-exercise-shoulder-press', 'template-exercise-incline'],
    });
  });

  it('renders a fallback state when the template request returns 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              code: 'WORKOUT_TEMPLATE_NOT_FOUND',
              message: 'Workout template not found',
            },
          },
          { status: 404 },
        ),
      ),
    );

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="missing-template" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Template not found' }, { timeout: 2_000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Workouts' })).toHaveAttribute(
      'href',
      '/workouts',
    );
  });

  it('treats legacy slug template IDs as not found when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              code: 'UPSTREAM_ERROR',
              message: 'unexpected error',
            },
          },
          { status: 500 },
        ),
      ),
    );

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="upper-push" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Template not found' }, { timeout: 4_000 }),
    ).toBeInTheDocument();
  });

  it('keeps generic error messaging for UUID template IDs on non-404 failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              code: 'UPSTREAM_ERROR',
              message: 'unexpected error',
            },
          },
          { status: 500 },
        ),
      ),
    );

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="2679a7dd-4a40-4c3e-8bf6-7a70eb4ab5db" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Unable to load template' }, { timeout: 4_000 }),
    ).toBeInTheDocument();
  });
});
