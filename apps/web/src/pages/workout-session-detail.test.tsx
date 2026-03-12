import { screen } from '@testing-library/react';
import type { WorkoutSession } from '@pulse/shared';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import { WorkoutSessionDetailPage } from './workout-session-detail';

const currentSession = createSession();
const previousSession = createSession({
  id: 'session-previous',
  date: '2026-02-20',
  startedAt: Date.parse('2026-02-20T18:00:00Z'),
  completedAt: Date.parse('2026-02-20T19:00:00Z'),
  sets: [
    createSet({
      id: 'set-prev-1',
      exerciseId: 'incline-dumbbell-press',
      setNumber: 1,
      reps: 8,
      weight: 45,
      section: 'main',
    }),
  ],
});

beforeEach(() => {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');

  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);

    if (url.includes('/api/v1/workout-sessions?status=completed')) {
      return Promise.resolve(
        jsonResponse({
          data: [
            {
              id: currentSession.id,
              name: currentSession.name,
              date: currentSession.date,
              status: currentSession.status,
              templateId: currentSession.templateId,
              templateName: 'Upper Push',
              startedAt: currentSession.startedAt,
              completedAt: currentSession.completedAt,
              duration: currentSession.duration,
              exerciseCount: 2,
              createdAt: currentSession.createdAt,
            },
            {
              id: previousSession.id,
              name: previousSession.name,
              date: previousSession.date,
              status: previousSession.status,
              templateId: previousSession.templateId,
              templateName: 'Upper Push',
              startedAt: previousSession.startedAt,
              completedAt: previousSession.completedAt,
              duration: previousSession.duration,
              exerciseCount: 1,
              createdAt: previousSession.createdAt,
            },
          ],
        }),
      );
    }

    if (url.includes(`/api/v1/workout-sessions/${currentSession.id}`)) {
      return Promise.resolve(jsonResponse({ data: currentSession }));
    }

    if (url.includes(`/api/v1/workout-sessions/${previousSession.id}`)) {
      return Promise.resolve(jsonResponse({ data: previousSession }));
    }

    if (url.includes('/api/v1/workout-sessions/nonexistent-id')) {
      return Promise.resolve(
        jsonResponse(
          {
            error: {
              code: 'WORKOUT_SESSION_NOT_FOUND',
              message: 'Workout session not found',
            },
          },
          { status: 404 },
        ),
      );
    }

    if (url.includes('/api/v1/workout-templates/template-upper-push')) {
      return Promise.resolve(
        jsonResponse({
          data: {
            id: 'template-upper-push',
            userId: 'user-1',
            name: 'Upper Push',
            description: null,
            tags: ['upper-body', 'push'],
            sections: [
              {
                type: 'warmup',
                exercises: [],
              },
              {
                type: 'main',
                exercises: [
                  {
                    id: 'template-main-1',
                    exerciseId: 'incline-dumbbell-press',
                    exerciseName: 'Incline Dumbbell Press',
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
        }),
      );
    }

    throw new Error(`Unhandled request: ${url}`);
  });
});

afterEach(() => {
  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  vi.restoreAllMocks();
});

function renderWithRoute(sessionId: string, view?: 'list' | 'calendar') {
  const search = view ? `?view=${view}` : '';
  return renderWithQueryClient(
    <MemoryRouter initialEntries={[`/workouts/session/${sessionId}${search}`]}>
      <Routes>
        <Route element={<WorkoutSessionDetailPage />} path="/workouts/session/:sessionId" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WorkoutSessionDetailPage', () => {
  it('renders not-found state for unknown sessionId', async () => {
    renderWithRoute('nonexistent-id');

    expect(
      await screen.findByText('Session not found', {}, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to workouts/i })).toHaveAttribute(
      'href',
      '/workouts?view=calendar',
    );
  });

  it('links back to the originating workouts view when view param is present', async () => {
    renderWithRoute(currentSession.id, 'list');

    expect(await screen.findByText('Upper Push')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to workouts/i })).toHaveAttribute(
      'href',
      '/workouts?view=list',
    );
  });

  it('renders session header, summary stats, and tags', async () => {
    renderWithRoute(currentSession.id);

    expect(await screen.findByText('Upper Push')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(await screen.findByText('Upper Body')).toBeInTheDocument();
    expect(screen.getAllByText('Push').length).toBeGreaterThan(0);
  });

  it('renders collapsible section breakdown with logged sets', async () => {
    renderWithRoute(currentSession.id);

    expect(await screen.findByText('Section breakdown')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Main' }).closest('details')).toHaveAttribute(
      'open',
    );
    expect(screen.getAllByText(/Set 1:/i).length).toBeGreaterThan(0);
  });

  it('renders feedback card when session has feedback', async () => {
    renderWithRoute(currentSession.id);

    expect(await screen.findByText('Feedback')).toBeInTheDocument();
    expect(screen.getByText('Energy')).toBeInTheDocument();
    expect(screen.getByText('Recovery')).toBeInTheDocument();
    expect(screen.getByText('Technique')).toBeInTheDocument();
    expect(screen.getByText(currentSession.feedback?.notes ?? '')).toBeInTheDocument();
  });

  it('renders session notes when present', async () => {
    renderWithRoute(currentSession.id);

    expect(await screen.findByText('Session Notes')).toBeInTheDocument();
    expect(screen.getByText(currentSession.notes ?? '')).toBeInTheDocument();
  });

  it('renders Repeat Workout button with correct link', async () => {
    renderWithRoute(currentSession.id);

    const repeatButton = await screen.findByRole('link', { name: /repeat workout/i });
    expect(repeatButton).toHaveAttribute('href', '/workouts/active?template=template-upper-push');
  });
});

function createSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session-current',
    userId: 'user-1',
    templateId: 'template-upper-push',
    name: 'Upper Push',
    date: '2026-03-02',
    status: 'completed',
    startedAt: Date.parse('2026-03-02T18:00:00Z'),
    completedAt: Date.parse('2026-03-02T19:00:00Z'),
    duration: 60,
    timeSegments: [],
    feedback: {
      energy: 4,
      recovery: 4,
      technique: 5,
      notes: 'Strong pressing day.',
    },
    notes: 'Solid control and tempo.',
    sets: [
      createSet({
        id: 'set-current-1',
        exerciseId: 'incline-dumbbell-press',
        setNumber: 1,
        reps: 10,
        weight: 50,
        section: 'main',
      }),
      createSet({
        id: 'set-current-2',
        exerciseId: 'incline-dumbbell-press',
        setNumber: 2,
        reps: 9,
        weight: 45,
        section: 'main',
      }),
    ],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createSet(
  overrides: Partial<WorkoutSession['sets'][number]>,
): WorkoutSession['sets'][number] {
  return {
    id: 'set-default',
    exerciseId: 'incline-dumbbell-press',
    setNumber: 1,
    weight: 50,
    reps: 10,
    completed: true,
    skipped: false,
    section: 'main',
    notes: null,
    createdAt: 1,
    ...overrides,
  };
}
