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
            exercise: {
              formCues: ['Keep cadence steady'],
              coachingNotes: null,
              instructions: null,
            },
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
            exercise: {
              formCues: ['Tuck shoulder blades'],
              coachingNotes: 'Keep your upper back pinned to the bench.',
              instructions: 'Lower dumbbells with control, then drive straight up.',
            },
            formCues: ['Tuck shoulder blades'],
            cues: ['Drive feet into the floor', 'Keep wrists stacked'],
            programmingNotes: 'Top set first, then reduce load for back-off sets.',
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

type MutableTemplateExercise = Omit<
  (typeof templatePayload)['data']['sections'][number]['exercises'][number],
  'supersetGroup'
> & {
  supersetGroup: string | null;
};

beforeEach(() => {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
});

afterEach(() => {
  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY);
  vi.useRealTimers();
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
    expect(screen.getAllByText('1 exercise')).toHaveLength(2);
    expect(screen.getByText('0 exercises')).toBeInTheDocument();

    const inclinePressCard = screen
      .getByText('Incline Dumbbell Press')
      .closest('[data-slot="card"]');

    expect(inclinePressCard).not.toBeNull();
    expect(
      within(inclinePressCard as HTMLElement).getByRole('button', {
        name: 'Drag handle for Incline Dumbbell Press',
      }),
    ).toHaveClass('size-11', 'min-h-11', 'min-w-11');
    expect(
      within(inclinePressCard as HTMLElement).getByRole('button', {
        name: 'Exercise actions for Incline Dumbbell Press',
      }),
    ).toHaveClass('size-11', 'min-h-11', 'min-w-11');
    expect(within(inclinePressCard as HTMLElement).getByText('3×8-10')).toBeInTheDocument();
    expect(within(inclinePressCard as HTMLElement).getByText('Tempo: 3-1-1-0')).toBeInTheDocument();
    expect(within(inclinePressCard as HTMLElement).getByText(/Rest: 90s/)).toBeInTheDocument();
    expect(
      within(inclinePressCard as HTMLElement).getAllByText('Drive feet into the floor.').length,
    ).toBeGreaterThan(0);

    fireEvent.click(within(inclinePressCard as HTMLElement).getByText('Show full set detail'));
    fireEvent.click(
      within(inclinePressCard as HTMLElement).getByRole('button', { name: 'Show notes' }),
    );
    expect(within(inclinePressCard as HTMLElement).getByText('Exercise cues')).toBeInTheDocument();
    expect(within(inclinePressCard as HTMLElement).getByText('Template cues')).toBeInTheDocument();
    expect(
      within(inclinePressCard as HTMLElement).getByText('Tuck shoulder blades'),
    ).toBeInTheDocument();
    expect(
      within(inclinePressCard as HTMLElement).getByText('Keep wrists stacked'),
    ).toBeInTheDocument();

    expect(
      within(inclinePressCard as HTMLElement).getByText('Exercise coaching notes'),
    ).toBeInTheDocument();
    expect(
      within(inclinePressCard as HTMLElement).getByText(
        'Keep your upper back pinned to the bench.',
      ),
    ).toBeInTheDocument();
    expect(
      within(inclinePressCard as HTMLElement).getByText('Template programming notes'),
    ).toBeInTheDocument();
    expect(
      within(inclinePressCard as HTMLElement).getByText(
        'Top set first, then reduce load for back-off sets.',
      ),
    ).toBeInTheDocument();
  });

  it('saves inline sets, reps, rest, and notes on blur with debounce', async () => {
    const mutableTemplate = structuredClone(templatePayload);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(requestUrl, 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-templates/upper-push' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body ?? '{}'));
        mutableTemplate.data.sections = body.sections;
        return Promise.resolve(jsonResponse(mutableTemplate));
      }

      if (url.pathname === '/api/v1/workout-templates/upper-push') {
        return Promise.resolve(jsonResponse(mutableTemplate));
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="upper-push" />
      </MemoryRouter>,
    );

    const setsInput = await screen.findByLabelText('Sets for Incline Dumbbell Press');
    const repsInput = screen.getByLabelText('Reps for Incline Dumbbell Press');
    const restInput = screen.getByLabelText('Rest for Incline Dumbbell Press');
    const notesInput = screen.getByLabelText('Notes for Incline Dumbbell Press');

    fireEvent.change(setsInput, { target: { value: '4' } });
    fireEvent.blur(setsInput);
    fireEvent.change(repsInput, { target: { value: '6-8' } });
    fireEvent.blur(repsInput);
    fireEvent.change(restInput, { target: { value: '75' } });
    fireEvent.blur(restInput);
    fireEvent.change(notesInput, { target: { value: 'Pause one second at bottom.' } });
    fireEvent.blur(notesInput);

    await waitFor(
      () => {
        expect(
          fetchSpy.mock.calls.some(
            ([input, init]) =>
              String(input).includes('/api/v1/workout-templates/upper-push') &&
              init?.method === 'PATCH',
          ),
        ).toBe(true);
      },
      { timeout: 2_000 },
    );

    const updateCall = fetchSpy.mock.calls.find(
      ([input, init]) =>
        String(input).includes('/api/v1/workout-templates/upper-push') && init?.method === 'PATCH',
    );
    const body = JSON.parse(String(updateCall?.[1]?.body));
    const updatedExercise = body.sections[1].exercises[0];

    expect(updatedExercise.sets).toBe(4);
    expect(updatedExercise.repsMin).toBe(6);
    expect(updatedExercise.repsMax).toBe(8);
    expect(updatedExercise.restSeconds).toBe(75);
    expect(updatedExercise.notes).toBe('Pause one second at bottom.');
  });

  it('renders add exercise button for each section and adds to selected section', async () => {
    const mutableTemplate = structuredClone(templatePayload);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(requestUrl, 'https://pulse.test');

      if (url.pathname === '/api/v1/exercises') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'rope-pushdown',
                userId: 'user-1',
                name: 'Rope Pushdown',
                muscleGroups: ['triceps'],
                equipment: 'cable',
                category: 'isolation',
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
              limit: 8,
              total: 1,
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-templates/upper-push' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body ?? '{}'));
        mutableTemplate.data.sections = body.sections;
        return Promise.resolve(jsonResponse(mutableTemplate));
      }

      if (url.pathname === '/api/v1/workout-templates/upper-push') {
        return Promise.resolve(jsonResponse(mutableTemplate));
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="upper-push" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('button', { name: 'Add exercise to Warmup section' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add exercise to Main section' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add exercise to Cooldown section' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add exercise to Main section' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: /Rope Pushdown/i }));

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([input, init]) =>
            String(input).includes('/api/v1/workout-templates/upper-push') &&
            init?.method === 'PATCH',
        ),
      ).toBe(true);
    });

    const updateCall = fetchSpy.mock.calls.find(
      ([input, init]) =>
        String(input).includes('/api/v1/workout-templates/upper-push') && init?.method === 'PATCH',
    );
    const body = JSON.parse(String(updateCall?.[1]?.body));
    const mainSection = body.sections.find((section: { type: string }) => section.type === 'main');
    expect(
      mainSection.exercises.some(
        (exercise: { exerciseId: string }) => exercise.exerciseId === 'rope-pushdown',
      ),
    ).toBe(true);
  });

  it('creates a workout session before navigating to the active workout page', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);

      if (url.endsWith('/api/v1/workout-templates/upper-push')) {
        return Promise.resolve(jsonResponse(templatePayload));
      }

      if (url.includes('/api/v1/scheduled-workouts') && (init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.includes('/api/v1/workout-sessions?') && (init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
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

  it('renders tracking-type-specific prescriptions and set targets in template detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith('/api/v1/workout-templates/upper-push')) {
        return Promise.resolve(
          jsonResponse({
            data: {
              ...templatePayload.data,
              sections: [
                { type: 'warmup', exercises: [] },
                {
                  type: 'main',
                  exercises: [
                    {
                      id: 'exercise-reps-only',
                      exerciseId: 'mobility-drill',
                      exerciseName: 'Mobility Drill',
                      trackingType: 'reps_only',
                      formCues: [],
                      sets: 2,
                      repsMin: 15,
                      repsMax: 15,
                      tempo: null,
                      restSeconds: 30,
                      supersetGroup: null,
                      notes: null,
                      cues: [],
                    },
                    {
                      id: 'exercise-seconds-only',
                      exerciseId: 'dead-hang',
                      exerciseName: 'Dead Hang',
                      trackingType: 'seconds_only',
                      formCues: [],
                      sets: 2,
                      repsMin: null,
                      repsMax: null,
                      tempo: null,
                      restSeconds: 45,
                      supersetGroup: null,
                      notes: null,
                      cues: [],
                      setTargets: [
                        { setNumber: 1, targetSeconds: 45 },
                        { setNumber: 2, targetSeconds: 60 },
                      ],
                    },
                    {
                      id: 'exercise-bodyweight-reps',
                      exerciseId: 'pull-up',
                      exerciseName: 'Pull-up',
                      trackingType: 'bodyweight_reps',
                      formCues: [],
                      sets: 3,
                      repsMin: 6,
                      repsMax: 8,
                      tempo: null,
                      restSeconds: 90,
                      supersetGroup: null,
                      notes: null,
                      cues: [],
                    },
                    {
                      id: 'exercise-weight-seconds',
                      exerciseId: 'farmers-carry-hold',
                      exerciseName: "Farmer's Hold",
                      trackingType: 'weight_seconds',
                      formCues: [],
                      sets: 2,
                      repsMin: null,
                      repsMax: null,
                      tempo: null,
                      restSeconds: 90,
                      supersetGroup: null,
                      notes: null,
                      cues: [],
                      setTargets: [
                        { setNumber: 1, targetWeight: 40, targetSeconds: 30 },
                        { setNumber: 2, targetWeight: 40, targetSeconds: 30 },
                      ],
                    },
                    {
                      id: 'exercise-reps-seconds',
                      exerciseId: 'burpee-interval',
                      exerciseName: 'Burpee Interval',
                      trackingType: 'reps_seconds',
                      formCues: [],
                      sets: 2,
                      repsMin: 10,
                      repsMax: 12,
                      tempo: null,
                      restSeconds: 90,
                      supersetGroup: null,
                      notes: null,
                      cues: [],
                      setTargets: [
                        { setNumber: 1, targetSeconds: 30 },
                        { setNumber: 2, targetSeconds: 30 },
                      ],
                    },
                    {
                      id: 'exercise-distance',
                      exerciseId: 'sled-push',
                      exerciseName: 'Sled Push',
                      trackingType: 'distance',
                      formCues: [],
                      sets: 3,
                      repsMin: null,
                      repsMax: null,
                      tempo: null,
                      restSeconds: 120,
                      supersetGroup: null,
                      notes: null,
                      cues: [],
                      setTargets: [
                        { setNumber: 1, targetDistance: 0.25 },
                        { setNumber: 2, targetDistance: 0.25 },
                        { setNumber: 3, targetDistance: 0.25 },
                      ],
                    },
                    {
                      id: 'exercise-cardio',
                      exerciseId: 'air-bike',
                      exerciseName: 'Air Bike',
                      trackingType: 'cardio',
                      formCues: [],
                      sets: 1,
                      repsMin: null,
                      repsMax: null,
                      tempo: null,
                      restSeconds: 60,
                      supersetGroup: null,
                      notes: null,
                      cues: [],
                      setTargets: [{ setNumber: 1, targetSeconds: 300, targetDistance: 1 }],
                    },
                  ],
                },
                { type: 'cooldown', exercises: [] },
              ],
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="upper-push" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('2 x 15')).toBeInTheDocument();
    expect(screen.getByText('2 x 45s')).toBeInTheDocument();
    expect(screen.getByText('Set 1: 45s • Set 2: 60s')).toBeInTheDocument();
    expect(screen.getByText('3 x 6-8 (bodyweight)')).toBeInTheDocument();
    expect(screen.getByText('2 x 40 lbs x 30s')).toBeInTheDocument();
    expect(screen.getByText('2 x 10-12 x 30s')).toBeInTheDocument();
    expect(screen.getByText('3 x 0.25 mi')).toBeInTheDocument();
    expect(screen.getByText('1 x 300s + 1 mi')).toBeInTheDocument();
  });

  it('schedules a workout from the template detail view', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);

      if (url.endsWith('/api/v1/workout-templates/upper-push')) {
        return Promise.resolve(jsonResponse(templatePayload));
      }

      if (url.includes('/api/v1/scheduled-workouts?') && (init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.includes('/api/v1/workout-sessions?') && (init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith('/api/v1/scheduled-workouts') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'scheduled-1',
              userId: 'user-1',
              templateId: 'upper-push',
              date: '2026-03-20',
              sessionId: null,
              createdAt: 1,
              updatedAt: 1,
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="upper-push" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Schedule' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Schedule' }));

    await waitFor(() => {
      const scheduleCall = fetchSpy.mock.calls.find(([input, init]) => {
        const requestMethod = input instanceof Request ? input.method : (init?.method ?? 'GET');
        const requestUrl = input instanceof Request ? input.url : String(input);

        return requestUrl.endsWith('/api/v1/scheduled-workouts') && requestMethod === 'POST';
      });

      expect(scheduleCall).toBeDefined();
    });
  });

  it('shows duplicate warning before starting when the day already has workouts', async () => {
    const createSessionSpy = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);

      if (url.endsWith('/api/v1/workout-templates/upper-push')) {
        return Promise.resolve(jsonResponse(templatePayload));
      }

      if (url.includes('/api/v1/scheduled-workouts?') && (init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'scheduled-1',
                date: '2026-03-07',
                templateId: 'upper-push',
                templateName: 'Upper Push',
                sessionId: null,
                createdAt: 1,
              },
            ],
          }),
        );
      }

      if (url.includes('/api/v1/workout-sessions?') && (init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith('/api/v1/workout-sessions') && init?.method === 'POST') {
        createSessionSpy();
        return Promise.resolve(jsonResponse(createdSessionPayload, { status: 201 }));
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="upper-push" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Workout' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('This day already has a workout')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(createSessionSpy).not.toHaveBeenCalled();
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

  it('opens swap dialog from template exercise menu and swaps to a related exercise', async () => {
    const mutableTemplate = structuredClone(templatePayload);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-templates/upper-push') {
        return Promise.resolve(jsonResponse(mutableTemplate));
      }

      if (url.pathname === '/api/v1/exercises') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'incline-dumbbell-press',
                userId: 'user-1',
                name: 'Incline Dumbbell Press',
                muscleGroups: ['upper chest', 'triceps'],
                equipment: 'Dumbbells',
                category: 'compound',
                trackingType: 'weight_reps',
                tags: [],
                formCues: [],
                instructions: null,
                coachingNotes: null,
                relatedExerciseIds: ['seated-dumbbell-shoulder-press'],
                createdAt: 1,
                updatedAt: 1,
              },
              {
                id: 'seated-dumbbell-shoulder-press',
                userId: 'user-1',
                name: 'Seated Dumbbell Shoulder Press',
                muscleGroups: ['shoulders', 'triceps'],
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
              {
                id: 'cable-fly',
                userId: 'user-1',
                name: 'Cable Fly',
                muscleGroups: ['chest'],
                equipment: 'Cable',
                category: 'isolation',
                trackingType: 'reps_only',
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

      if (
        url.pathname ===
          '/api/v1/workout-templates/upper-push/exercises/incline-dumbbell-press/swap' &&
        init?.method === 'PATCH'
      ) {
        mutableTemplate.data.sections[1].exercises[0].exerciseId = 'seated-dumbbell-shoulder-press';
        mutableTemplate.data.sections[1].exercises[0].exerciseName =
          'Seated Dumbbell Shoulder Press';

        return Promise.resolve(jsonResponse(mutableTemplate));
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
      within(exerciseCard as HTMLElement).getByRole('button', { name: 'Swap exercise' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Related exercises')).toBeInTheDocument();
    expect(
      await within(dialog).findByRole('button', { name: /Seated Dumbbell Shoulder Press/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole('button', { name: /Seated Dumbbell Shoulder Press/i }),
    );

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([input, init]) =>
            String(input).includes(
              '/api/v1/workout-templates/upper-push/exercises/incline-dumbbell-press/swap',
            ) && init?.method === 'PATCH',
        ),
      ).toBe(true);
    });
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
      exercise: {
        formCues: [],
        coachingNotes: null,
        instructions: null,
      },
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

  it('creates and removes supersets from selected exercises', async () => {
    const mutableTemplate = structuredClone(templatePayload);
    const mainExercises = mutableTemplate.data.sections[1].exercises as MutableTemplateExercise[];
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
      exercise: {
        formCues: [],
        coachingNotes: null,
        instructions: null,
      },
      formCues: [],
      cues: [],
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-templates/upper-push' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body ?? '{}'));
        mutableTemplate.data.sections = body.sections as typeof mutableTemplate.data.sections;
        return Promise.resolve(jsonResponse(mutableTemplate));
      }

      if (url.pathname === '/api/v1/workout-templates/upper-push') {
        return Promise.resolve(jsonResponse(mutableTemplate));
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="upper-push" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Manage supersets' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(
      within(dialog).getByRole('checkbox', {
        name: /Incline Dumbbell Press/i,
      }),
    );
    fireEvent.click(
      within(dialog).getByRole('checkbox', {
        name: /Seated Dumbbell Shoulder Press/i,
      }),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create superset' }));

    await waitFor(() => {
      const patchCalls = fetchSpy.mock.calls.filter(
        ([input, init]) =>
          String(input).includes('/api/v1/workout-templates/upper-push') && init?.method === 'PATCH',
      );
      const firstPatch = patchCalls[0];
      expect(firstPatch).toBeDefined();
      const payload = JSON.parse(String(firstPatch?.[1]?.body ?? '{}'));
      expect(payload.sections[1].exercises[0].supersetGroup).toBe('superset-a');
      expect(payload.sections[1].exercises[1].supersetGroup).toBe('superset-a');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Manage supersets' }));
    const removeDialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(removeDialog).getByRole('checkbox', {
        name: /Incline Dumbbell Press/i,
      }),
    );
    fireEvent.click(
      within(removeDialog).getByRole('checkbox', {
        name: /Seated Dumbbell Shoulder Press/i,
      }),
    );
    fireEvent.click(within(removeDialog).getByRole('button', { name: 'Remove superset' }));

    await waitFor(() => {
      const patchCalls = fetchSpy.mock.calls.filter(
        ([input, init]) =>
          String(input).includes('/api/v1/workout-templates/upper-push') && init?.method === 'PATCH',
      );
      const lastPatch = patchCalls.at(-1);
      expect(lastPatch).toBeDefined();
      const payload = JSON.parse(String(lastPatch?.[1]?.body ?? '{}'));
      expect(payload.sections[1].exercises[0].supersetGroup).toBeNull();
      expect(payload.sections[1].exercises[1].supersetGroup).toBeNull();
    });
  });

  it('renders visual superset grouping when contiguous exercises share a superset group', async () => {
    const groupedTemplate = structuredClone(templatePayload);
    const groupedMainExercises =
      groupedTemplate.data.sections[1].exercises as MutableTemplateExercise[];
    groupedMainExercises.push({
      id: 'template-exercise-shoulder-press',
      exerciseId: 'seated-dumbbell-shoulder-press',
      exerciseName: 'Seated Dumbbell Shoulder Press',
      sets: 3,
      repsMin: 8,
      repsMax: 10,
      tempo: null,
      restSeconds: 90,
      supersetGroup: 'superset-a',
      notes: null,
      exercise: {
        formCues: [],
        coachingNotes: null,
        instructions: null,
      },
      formCues: [],
      cues: [],
    });
    (groupedTemplate.data.sections[1].exercises[0] as MutableTemplateExercise).supersetGroup =
      'superset-a';

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith('/api/v1/workout-templates/upper-push')) {
        return Promise.resolve(jsonResponse(groupedTemplate));
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="upper-push" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Superset A')).toBeInTheDocument();
  });

  it('opens exercise detail modal with overview, history, and related data and saves coaching notes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-templates/upper-push') {
        return Promise.resolve(jsonResponse(templatePayload));
      }

      if (url.pathname === '/api/v1/exercises/incline-dumbbell-press' && init?.method !== 'PATCH') {
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
              formCues: ['Tuck shoulder blades', 'Drive elbows 45°'],
              instructions: 'Lower dumbbells with control, then drive up.',
              coachingNotes: 'Keep your upper back pinned to the bench.',
              relatedExerciseIds: ['seated-dumbbell-shoulder-press'],
              createdAt: 1,
              updatedAt: 1,
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/exercises/incline-dumbbell-press/last-performance') {
        return Promise.resolve(
          jsonResponse({
            data: {
              history: {
                sessionId: 'session-1',
                date: '2026-03-06',
                sets: [
                  { setNumber: 1, reps: 10, weight: 70 },
                  { setNumber: 2, reps: 9, weight: 70 },
                ],
              },
              related: [
                {
                  exerciseId: 'seated-dumbbell-shoulder-press',
                  exerciseName: 'Seated Dumbbell Shoulder Press',
                  trackingType: 'weight_reps',
                  history: {
                    sessionId: 'session-2',
                    date: '2026-03-04',
                    sets: [{ setNumber: 1, reps: 8, weight: 55 }],
                  },
                },
              ],
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/exercises/incline-dumbbell-press' && init?.method === 'PATCH') {
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
              instructions: 'Lower dumbbells with control, then drive up.',
              coachingNotes: JSON.parse(String(init.body ?? '{}')).coachingNotes,
              relatedExerciseIds: ['seated-dumbbell-shoulder-press'],
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

    fireEvent.click(await screen.findByRole('button', { name: 'Incline Dumbbell Press' }));
    const dialog = await screen.findByRole('dialog');

    expect(await within(dialog).findByText(/upper chest, triceps/i)).toBeInTheDocument();
    expect(within(dialog).getByText('Form cues')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'History' }));
    expect(await within(dialog).findByText(/Mar/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Related' }));
    expect(
      await within(dialog).findByText('Seated Dumbbell Shoulder Press'),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Overview' }));
    const notesField = within(dialog).getByLabelText('Coaching notes');
    fireEvent.change(notesField, {
      target: { value: 'Keep upper back pinned and pause for one count.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save coaching notes' }));

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([input, init]) =>
            String(input).includes('/api/v1/exercises/incline-dumbbell-press') &&
            init?.method === 'PATCH' &&
            JSON.parse(String(init.body ?? '{}')).coachingNotes ===
              'Keep upper back pinned and pause for one count.',
        ),
      ).toBe(true);
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
