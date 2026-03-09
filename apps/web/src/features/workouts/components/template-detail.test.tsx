import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import { WorkoutTemplateDetail } from './template-detail';

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

    const formCuesDetails = within(inclinePressCard as HTMLElement)
      .getByText('Form cues')
      .closest('details');

    expect(formCuesDetails).not.toHaveAttribute('open');

    fireEvent.click(within(inclinePressCard as HTMLElement).getByText('Form cues'));

    expect(formCuesDetails).toHaveAttribute('open');
    expect(screen.getByText('Keep wrists stacked')).toBeInTheDocument();
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
        reps: null,
        section: 'warmup',
        setNumber: 1,
        weight: null,
      }),
      expect.objectContaining({
        exerciseId: 'incline-dumbbell-press',
        reps: null,
        section: 'main',
        setNumber: 1,
        weight: null,
      }),
      expect.objectContaining({
        exerciseId: 'incline-dumbbell-press',
        reps: null,
        section: 'main',
        setNumber: 2,
        weight: null,
      }),
      expect.objectContaining({
        exerciseId: 'incline-dumbbell-press',
        reps: null,
        section: 'main',
        setNumber: 3,
        weight: null,
      }),
    ]);
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
