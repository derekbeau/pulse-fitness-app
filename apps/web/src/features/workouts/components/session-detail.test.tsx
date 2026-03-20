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

    expect(
      await screen.findByText('Session not found', {}, { timeout: 5_000 }),
    ).toBeInTheDocument();
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
          notes: 'Bench at setting 5; keep elbows tucked.',
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
    expect(screen.getByText('Session Notes')).toBeInTheDocument();
    expect(screen.getByLabelText(/show comparison/i)).toBeInTheDocument();
    expect(screen.queryByText('Volume progression')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Set 1:/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Open Incline Dumbbell Press history' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Great pacing and clean reps.')).toBeInTheDocument();
    expect(screen.getByText('Felt strong and stable today.')).toBeInTheDocument();
    expect(screen.getByText('Bench at setting 5; keep elbows tucked.')).toBeInTheDocument();
  });

  it('formats receipt duration from seconds', async () => {
    const currentSession = createSession({
      id: 'session-duration-format',
      templateId: 'template-upper-push',
      duration: 5400,
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
          duration: currentSession.duration,
        }),
      ],
    });

    renderSessionDetail(currentSession.id);

    expect(await screen.findByText('Workout receipt')).toBeInTheDocument();
    expect(screen.getByText(/1h 30m/)).toBeInTheDocument();
  });

  it('renders markdown in read-only notes and escapes unsafe HTML', async () => {
    const currentSession = createSession({
      id: 'session-markdown-notes',
      templateId: 'template-upper-push',
      notes:
        '## Session focus\nLine one\nLine two\n\n- **Brace** before unrack\n- Keep a steady tempo\n\n<script>alert("xss")</script>',
      feedback: {
        energy: 4,
        recovery: 4,
        technique: 5,
        notes: 'Reflection line one\nReflection line two',
        responses: [
          {
            id: 'coach-note',
            label: 'Coach note',
            type: 'text',
            value: 'Solid pace today.',
            notes: 'Stay *conservative* on set 1.\n- Add a pause',
          },
        ],
      },
      sets: [
        createSet({
          id: 'set-markdown-note',
          exerciseId: 'incline-dumbbell-press',
          setNumber: 1,
          notes: '- Bench at setting 5\n- Keep elbows tucked.',
          reps: 8,
          section: 'main',
          weight: 50,
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
    expect(screen.getByText('Session focus').tagName).toBe('H2');
    expect(screen.getByText('Brace').tagName).toBe('STRONG');
    expect(screen.getByText('Keep elbows tucked.').closest('li')).toBeInTheDocument();
    expect(screen.getByText('conservative').tagName).toBe('EM');
    expect(screen.getByText('<script>alert("xss")</script>')).toBeInTheDocument();
    expect(document.querySelectorAll('br').length).toBeGreaterThan(0);
    expect(document.querySelector('script')).not.toBeInTheDocument();
  });

  it('renders structured feedback responses when available', async () => {
    const currentSession = createSession({
      id: 'session-structured-feedback',
      templateId: 'template-upper-push',
      feedback: {
        energy: 4,
        recovery: 3,
        technique: 4,
        notes: 'Felt strong overall.',
        responses: [
          {
            id: 'session-rpe',
            label: 'Session RPE',
            type: 'scale',
            value: 8,
          },
          {
            id: 'energy-post-workout',
            label: 'Energy post workout',
            type: 'emoji',
            value: '💪',
          },
          {
            id: 'pain-discomfort',
            label: 'Any pain or discomfort?',
            type: 'yes_no',
            value: true,
            notes: 'Mild right knee discomfort during split squats.',
          },
        ],
      },
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

    expect(await screen.findByText('Session RPE')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Energy post workout')).toBeInTheDocument();
    expect(screen.getByText('💪')).toBeInTheDocument();
    expect(screen.getByText('Any pain or discomfort?')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Mild right knee discomfort during split squats.')).toBeInTheDocument();
    expect(screen.getByText('Felt strong overall.')).toBeInTheDocument();
  });

  it('hides the reps stat card for time-only sessions', async () => {
    const currentSession = createSession({
      id: 'session-time-only',
      templateId: 'template-upper-push',
      sets: [
        createSet({
          id: 'set-stretch-1',
          exerciseId: 'couch-stretch',
          setNumber: 1,
          reps: 90,
          weight: null,
          section: 'cooldown',
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
    expect(screen.getByText('Seconds')).toBeInTheDocument();
    expect(screen.queryByText(/^Reps$/)).not.toBeInTheDocument();
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

  it('opens full exercise history from the session detail exercise action', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /open incline dumbbell press history/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Incline Dumbbell Press history')).toBeInTheDocument();
    expect(await screen.findByText(/Mar 1, 2026 · 105x8/)).toBeInTheDocument();
  });

  it('supports inline correction editing and only submits changed values', async () => {
    const currentSession = createSession({
      id: 'session-correction-save',
      templateId: 'template-upper-push',
      sets: [
        createSet({
          id: 'set-correction-1',
          exerciseId: 'incline-dumbbell-press',
          setNumber: 1,
          reps: 10,
          weight: 50,
          section: 'main',
        }),
      ],
    });
    const correctedSession = createSession({
      ...currentSession,
      sets: [
        createSet({
          id: 'set-correction-1',
          exerciseId: 'incline-dumbbell-press',
          setNumber: 1,
          reps: 10,
          weight: 55,
          section: 'main',
        }),
      ],
    });
    let capturedCorrectionPayload: unknown = null;

    mockSessionDetailRequests({
      correctedSession,
      onCorrectionRequest: (payload) => {
        capturedCorrectionPayload = payload;
      },
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText(/adjust set values inline/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Weight for set 1'), {
      target: { value: '55' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Set 1: 55 lbs × 10 reps', { selector: 'span' }),
    ).toBeInTheDocument();
    expect(capturedCorrectionPayload).toEqual({
      corrections: [
        {
          setId: 'set-correction-1',
          weight: 55,
        },
      ],
    });
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('cancels inline correction editing without calling the correction endpoint', async () => {
    const currentSession = createSession({
      id: 'session-correction-cancel',
      templateId: 'template-upper-push',
      sets: [
        createSet({
          id: 'set-correction-cancel-1',
          exerciseId: 'incline-dumbbell-press',
          setNumber: 1,
          reps: 10,
          weight: 50,
          section: 'main',
        }),
      ],
    });
    let correctionCalls = 0;

    mockSessionDetailRequests({
      onCorrectionRequest: () => {
        correctionCalls += 1;
      },
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Weight for set 1'), {
      target: { value: '55' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Set 1: 50 lbs × 10 reps', { selector: 'span' })).toBeInTheDocument();
    expect(correctionCalls).toBe(0);
  });

  it('keeps sections with exercise notes expanded by default', async () => {
    const currentSession = createSession({
      id: 'session-notes-visible',
      templateId: 'template-upper-push',
      sets: [
        createSet({
          id: 'set-warmup-note',
          exerciseId: 'row-erg',
          setNumber: 1,
          notes: 'Felt strong on this set, increased weight by 5lbs',
          reps: 240,
          section: 'warmup',
          weight: null,
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

    expect(
      await screen.findByText('Felt strong on this set, increased weight by 5lbs'),
    ).toBeInTheDocument();
    const warmupHeading = screen.getByRole('heading', { name: 'Warmup' });
    const warmupDetails = warmupHeading.closest('details');
    expect(warmupDetails).toHaveAttribute('open');
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
  correctedSession = null,
  onCorrectionRequest,
  sessionId,
  session = null,
  sessionStatus = 200,
  previousSession = null,
  sessions,
  templateName = 'Upper Push',
}: {
  correctedSession?: WorkoutSession | null;
  onCorrectionRequest?: (payload: unknown) => void;
  sessionId: string;
  session?: WorkoutSession | null;
  sessionStatus?: number;
  previousSession?: WorkoutSession | null;
  sessions: WorkoutSessionListItem[];
  templateName?: string;
}) {
  let activeSession = session;

  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

    if (url.includes('/api/v1/workout-sessions?status=completed')) {
      return Promise.resolve(jsonResponse({ data: sessions }));
    }

    if (method === 'PATCH' && url.includes(`/api/v1/workout-sessions/${sessionId}/corrections`)) {
      const body =
        typeof init?.body === 'string' && init.body.length > 0 ? JSON.parse(init.body) : null;
      onCorrectionRequest?.(body);
      activeSession = correctedSession ?? session;

      return Promise.resolve(jsonResponse({ data: activeSession }));
    }

    if (url.includes(`/api/v1/workout-sessions/${sessionId}`)) {
      if (sessionStatus !== 200 || activeSession == null) {
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

      return Promise.resolve(jsonResponse({ data: activeSession }));
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

    if (url.includes('/api/v1/exercises/incline-dumbbell-press/history')) {
      return Promise.resolve(
        jsonResponse({
          data: [
            {
              sessionId: 'session-last',
              date: '2026-03-01',
              notes: null,
              sets: [
                { setNumber: 1, reps: 8, weight: 105 },
                { setNumber: 2, reps: 8, weight: 100 },
              ],
            },
          ],
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
    timeSegments: [],
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

function createSessionListItem(overrides: Partial<WorkoutSessionListItem>): WorkoutSessionListItem {
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
