import { fireEvent, screen } from '@testing-library/react';
import type { WorkoutSession, WorkoutSessionListItem } from '@pulse/shared';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import { SessionDetail } from './session-detail';

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

beforeEach(() => {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
});

afterEach(() => {
  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  vi.restoreAllMocks();
});

describe('SessionDetail', () => {
  it('renders a not-found state for unknown sessions', async () => {
    mockSessionDetailRequests({
      sessionId: 'missing-session',
      sessionStatus: 404,
      sessions: [],
    });

    renderSessionDetail('missing-session');

    expect(await screen.findByText('Session not found', {}, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to workouts/i })).toHaveAttribute(
      'href',
      '/workouts?view=calendar',
    );
  });

  it('renders completed session receipt data from the workout session API', async () => {
    const currentSession = createSession({
      id: 'session-current',
      templateId: 'template-upper-push',
      notes: 'Felt strong and stable today.',
      feedback: {
        energy: 4,
        recovery: 4,
        technique: 5,
        notes: 'Great pacing and clean reps.',
      },
      sets: [
        createSet({
          id: 'set-row-1',
          exerciseId: 'row-erg',
          setNumber: 1,
          reps: 240,
          weight: null,
          section: 'warmup',
        }),
        createSet({
          id: 'set-press-1',
          exerciseId: 'incline-dumbbell-press',
          setNumber: 1,
          reps: 10,
          weight: 50,
          section: 'main',
        }),
        createSet({
          id: 'set-press-2',
          exerciseId: 'incline-dumbbell-press',
          setNumber: 2,
          reps: 9,
          weight: 45,
          section: 'main',
        }),
      ],
    });

    mockSessionDetailRequests({
      sessionId: currentSession.id,
      session: currentSession,
      sessions: [
        createSessionListItem({
          id: currentSession.id,
          templateId: currentSession.templateId,
          templateName: 'Upper Push',
          startedAt: currentSession.startedAt,
        }),
      ],
    });

    renderSessionDetail(currentSession.id);

    expect(await screen.findByText('Workout receipt')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Section breakdown')).toBeInTheDocument();
    expect(screen.getByText('Feedback')).toBeInTheDocument();
    expect(screen.getByText('Session notes')).toBeInTheDocument();
    expect(screen.getByLabelText(/show comparison/i)).toBeInTheDocument();
    expect(screen.queryByText('Volume progression')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Set 1:/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Great pacing and clean reps.')).toBeInTheDocument();
    expect(screen.getByText('Felt strong and stable today.')).toBeInTheDocument();
  });

  it('shows volume progression, deltas, and PR badges when comparison is enabled', async () => {
    const previousSession = createSession({
      id: 'session-previous',
      startedAt: Date.parse('2026-02-20T18:00:00Z'),
      completedAt: Date.parse('2026-02-20T19:00:00Z'),
      date: '2026-02-20',
      templateId: 'template-upper-push',
      sets: [
        createSet({
          id: 'set-prev-press-1',
          exerciseId: 'incline-dumbbell-press',
          setNumber: 1,
          reps: 9,
          weight: 45,
          section: 'main',
        }),
      ],
    });
    const currentSession = createSession({
      id: 'session-current',
      startedAt: Date.parse('2026-03-02T18:00:00Z'),
      completedAt: Date.parse('2026-03-02T19:00:00Z'),
      date: '2026-03-02',
      templateId: 'template-upper-push',
      sets: [
        createSet({
          id: 'set-current-press-1',
          exerciseId: 'incline-dumbbell-press',
          setNumber: 1,
          reps: 10,
          weight: 50,
          section: 'main',
        }),
      ],
    });

    mockSessionDetailRequests({
      sessionId: currentSession.id,
      session: currentSession,
      previousSession,
      sessions: [
        createSessionListItem({
          id: currentSession.id,
          templateId: currentSession.templateId,
          templateName: 'Upper Push',
          startedAt: currentSession.startedAt,
          date: currentSession.date,
        }),
        createSessionListItem({
          id: previousSession.id,
          templateId: previousSession.templateId,
          templateName: 'Upper Push',
          startedAt: previousSession.startedAt,
          date: previousSession.date,
        }),
      ],
    });

    renderSessionDetail(currentSession.id);
    await screen.findByText('Workout receipt');

    fireEvent.click(screen.getByLabelText(/show comparison/i));

    expect(await screen.findByText('Volume progression')).toBeInTheDocument();
    expect(screen.getByText('Volume vs Feb 20')).toBeInTheDocument();
    expect(screen.getByText('Weight +5 lbs')).toBeInTheDocument();
    expect(screen.getByText('Reps +1')).toBeInTheDocument();
    expect(screen.getByText('PR')).toBeInTheDocument();
  });

  it('shows the first-session fallback when there is no previous session for the template', async () => {
    const currentSession = createSession({
      id: 'session-current',
      templateId: 'template-full-body',
    });

    mockSessionDetailRequests({
      sessionId: currentSession.id,
      session: currentSession,
      sessions: [
        createSessionListItem({
          id: currentSession.id,
          templateId: currentSession.templateId,
          templateName: 'Full Body',
          startedAt: currentSession.startedAt,
        }),
      ],
      templateName: 'Full Body',
    });

    renderSessionDetail(currentSession.id);
    await screen.findByText('Workout receipt');

    fireEvent.click(screen.getByLabelText(/show comparison/i));

    expect(await screen.findByText('First session — no comparison available')).toBeInTheDocument();
  });

  it('opens an exercise trend chart from the session detail exercise action', async () => {
    const currentSession = createSession({
      id: 'session-current',
      templateId: 'template-upper-push',
      sets: [
        createSet({
          id: 'set-current-press-1',
          exerciseId: 'incline-dumbbell-press',
          setNumber: 1,
          reps: 10,
          weight: 50,
          section: 'main',
        }),
      ],
    });

    mockSessionDetailRequests({
      sessionId: currentSession.id,
      session: currentSession,
      sessions: [
        createSessionListItem({
          id: currentSession.id,
          templateId: currentSession.templateId,
          templateName: 'Upper Push',
          startedAt: currentSession.startedAt,
        }),
      ],
    });

    renderSessionDetail(currentSession.id);
    await screen.findByText('Workout receipt');

    fireEvent.click(screen.getByRole('button', { name: /open incline dumbbell press trend chart/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Incline Dumbbell Press trends')).toBeInTheDocument();
    expect(screen.getByLabelText('Incline Dumbbell Press trend chart')).toBeInTheDocument();
  });
});

function renderSessionDetail(sessionId: string) {
  return renderWithQueryClient(
    <MemoryRouter>
      <SessionDetail sessionId={sessionId} />
    </MemoryRouter>,
  );
}

function mockSessionDetailRequests({
  sessionId,
  session = null,
  sessionStatus = 200,
  previousSession = null,
  sessions,
  templateName = 'Upper Push',
}: {
  sessionId: string;
  session?: WorkoutSession | null;
  sessionStatus?: number;
  previousSession?: WorkoutSession | null;
  sessions: WorkoutSessionListItem[];
  templateName?: string;
}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);

    if (url.includes('/api/v1/users/me')) {
      return Promise.resolve(
        jsonResponse({
          data: {
            id: 'user-1',
            username: 'jordan',
            name: 'Jordan',
            weightUnit: 'lbs',
            createdAt: 1,
          },
        }),
      );
    }

    if (url.includes('/api/v1/workout-sessions?status=completed')) {
      return Promise.resolve(jsonResponse({ data: sessions }));
    }

    if (url.includes(`/api/v1/workout-sessions/${sessionId}`)) {
      if (sessionStatus !== 200 || session == null) {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                code: 'WORKOUT_SESSION_NOT_FOUND',
                message: 'Workout session not found',
              },
            },
            { status: sessionStatus },
          ),
        );
      }

      return Promise.resolve(jsonResponse({ data: session }));
    }

    if (previousSession && url.includes(`/api/v1/workout-sessions/${previousSession.id}`)) {
      return Promise.resolve(jsonResponse({ data: previousSession }));
    }

    if (session?.templateId && url.includes(`/api/v1/workout-templates/${session.templateId}`)) {
      return Promise.resolve(
        jsonResponse({
          data: {
            id: session.templateId,
            userId: 'user-1',
            name: templateName,
            description: null,
            tags: ['push'],
            sections: [
              {
                type: 'warmup',
                exercises: [
                  {
                    id: 'template-warmup-row',
                    exerciseId: 'row-erg',
                    exerciseName: 'Row Erg',
                    sets: 1,
                    repsMin: null,
                    repsMax: null,
                    tempo: null,
                    restSeconds: null,
                    supersetGroup: null,
                    notes: null,
                    cues: [],
                  },
                ],
              },
              {
                type: 'main',
                exercises: [
                  {
                    id: 'template-main-press',
                    exerciseId: 'incline-dumbbell-press',
                    exerciseName: 'Incline Dumbbell Press',
                    sets: 3,
                    repsMin: 8,
                    repsMax: 10,
                    tempo: '3110',
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
}

function createSession(overrides: Partial<WorkoutSession>): WorkoutSession {
  return {
    id: 'session-default',
    userId: 'user-1',
    templateId: 'template-upper-push',
    name: 'Upper Push',
    date: '2026-03-02',
    status: 'completed',
    startedAt: Date.parse('2026-03-02T18:00:00Z'),
    completedAt: Date.parse('2026-03-02T19:00:00Z'),
    duration: 60,
    feedback: null,
    notes: null,
    sets: [
      createSet({
        id: 'set-default-1',
        exerciseId: 'incline-dumbbell-press',
        setNumber: 1,
        reps: 10,
        weight: 50,
        section: 'main',
      }),
    ],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createSet(overrides: Partial<WorkoutSession['sets'][number]>): WorkoutSession['sets'][number] {
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

function createSessionListItem(
  overrides: Partial<WorkoutSessionListItem>,
): WorkoutSessionListItem {
  return {
    id: 'session-item-default',
    name: 'Upper Push',
    date: '2026-03-02',
    status: 'completed',
    templateId: 'template-upper-push',
    templateName: 'Upper Push',
    startedAt: Date.parse('2026-03-02T18:00:00Z'),
    completedAt: Date.parse('2026-03-02T19:00:00Z'),
    duration: 60,
    exerciseCount: 3,
    createdAt: 1,
    ...overrides,
  };
}
