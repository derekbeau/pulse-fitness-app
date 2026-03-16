import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import {
  WORKOUT_SESSION_COMPLETED_NOTICE,
  WORKOUT_SESSION_NOTICE_QUERY_KEY,
} from '@/features/workouts/lib/session-persistence';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';
import { WorkoutsPage } from './workouts';

const WORKOUTS_ONBOARDING_DISMISSED_KEY = 'pulse.workouts.onboarding.dismissed';

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

const completedSessionsResponse = [
  {
    id: 'session-1',
    name: 'Upper Push',
    date: '2026-03-02',
    status: 'completed',
    templateId: 'upper-push',
    templateName: 'Upper Push',
    startedAt: Date.parse('2026-03-02T18:00:00Z'),
    completedAt: Date.parse('2026-03-02T19:00:00Z'),
    duration: 60,
    exerciseCount: 6,
    createdAt: 1,
  },
];

const allSessionsResponse = [
  ...completedSessionsResponse,
  {
    id: 'session-2',
    name: 'Lower Quad-Dominant',
    date: '2026-03-12',
    status: 'in-progress',
    templateId: 'lower-quad-dominant',
    templateName: 'Lower Quad-Dominant',
    startedAt: Date.parse('2026-03-12T18:00:00Z'),
    completedAt: null,
    duration: null,
    exerciseCount: 4,
    createdAt: 2,
  },
  {
    id: 'session-4',
    name: 'Upper Push',
    date: '2026-03-13',
    status: 'paused',
    templateId: 'upper-push',
    templateName: 'Upper Push',
    startedAt: Date.parse('2026-03-13T18:00:00Z'),
    completedAt: null,
    duration: null,
    exerciseCount: 5,
    createdAt: 4,
  },
  {
    id: 'session-3',
    name: 'Upper Push',
    date: '2026-03-14',
    status: 'scheduled',
    templateId: 'upper-push',
    templateName: 'Upper Push',
    startedAt: Date.parse('2026-03-14T18:00:00Z'),
    completedAt: null,
    duration: null,
    exerciseCount: 5,
    createdAt: 3,
  },
];
const scheduledWorkoutsResponse = [
  {
    id: 'schedule-1',
    date: '2026-03-14',
    templateId: 'upper-push',
    templateName: 'Upper Push',
    sessionId: null,
    createdAt: 1,
  },
];

describe('WorkoutsPage', () => {
  beforeEach(() => {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
    window.localStorage.removeItem(WORKOUTS_ONBOARDING_DISMISSED_KEY);

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

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(
          jsonResponse({
            data:
              url.searchParams.get('status') === 'completed'
                ? completedSessionsResponse
                : allSessionsResponse,
          }),
        );
      }

      if (url.pathname === '/api/v1/scheduled-workouts') {
        return Promise.resolve(
          jsonResponse({
            data: scheduledWorkoutsResponse,
          }),
        );
      }

      if (url.pathname.startsWith('/api/v1/workout-templates/')) {
        const templateId = url.pathname.split('/').at(-1);
        const template = templatesResponse.find((entry) => entry.id === templateId) ?? null;

        if (!template) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: 'TEMPLATE_NOT_FOUND',
                  message: 'Template not found',
                },
              }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: 404,
              },
            ),
          );
        }

        return Promise.resolve(
          jsonResponse({
            data: template,
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });
  });

  afterEach(() => {
    window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(WORKOUTS_ONBOARDING_DISMISSED_KEY);
    vi.restoreAllMocks();
  });

  it('switches between the workouts views', async () => {
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <LocationProbe />
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Workouts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to Dashboard' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Calendar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByTestId('location-search')).toHaveTextContent('?view=calendar');
    expect(screen.getByText('Workout Calendar')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'List' }));

    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('location-search')).toHaveTextContent('?view=list');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'In Progress' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Workout Calendar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Templates' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exercises' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Exercise Library' })).toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('?view=exercises');
  });

  it('opens contextual workouts help from the page header', async () => {
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByRole('heading', { name: 'Workouts help' })).toBeInTheDocument();
    expect(screen.getByText(/templates\s*>\s*sessions\s*>\s*sets flow/i)).toBeInTheDocument();
    expect(screen.getByText(/active sessions are saved in localstorage/i)).toBeInTheDocument();
  });

  it('includes the current view in session links and routes in-progress/paused sessions to active workout', async () => {
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts?view=list']}>
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() => {
      expect(
        screen
          .getAllByRole('link')
          .some((link) => link.getAttribute('href') === '/workouts/session/session-1?view=list'),
      ).toBe(true);
    });

    const detailsLink = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href') === '/workouts/session/session-1?view=list');
    if (!detailsLink) {
      throw new Error('Expected session detail link with view=list query param');
    }
    expect(detailsLink).toHaveAttribute('href', '/workouts/session/session-1?view=list');

    const activeSessionLink = screen
      .getAllByRole('link')
      .find(
        (link) => link.getAttribute('href') === '/workouts/active?view=list&sessionId=session-2',
      );
    if (!activeSessionLink) {
      throw new Error('Expected in-progress session link to the active workout route');
    }
    expect(activeSessionLink).toHaveAttribute(
      'href',
      '/workouts/active?view=list&sessionId=session-2',
    );

    const pausedSessionLink = screen
      .getAllByRole('link')
      .find(
        (link) => link.getAttribute('href') === '/workouts/active?view=list&sessionId=session-4',
      );
    if (!pausedSessionLink) {
      throw new Error('Expected paused session link to the active workout route');
    }
    expect(pausedSessionLink).toHaveAttribute(
      'href',
      '/workouts/active?view=list&sessionId=session-4',
    );
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
    expect(searchbox).toHaveAttribute('id', 'template-search');
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

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(
          jsonResponse({
            data:
              url.searchParams.get('status') === 'completed'
                ? completedSessionsResponse
                : allSessionsResponse,
          }),
        );
      }

      if (url.pathname === '/api/v1/scheduled-workouts') {
        return Promise.resolve(
          jsonResponse({
            data: scheduledWorkoutsResponse,
          }),
        );
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

  it('renders the templates empty state with browse templates messaging', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-templates') {
        return Promise.resolve(
          jsonResponse({
            data: [],
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(
          jsonResponse({
            data:
              url.searchParams.get('status') === 'completed'
                ? completedSessionsResponse
                : allSessionsResponse,
          }),
        );
      }

      if (url.pathname === '/api/v1/scheduled-workouts') {
        return Promise.resolve(
          jsonResponse({
            data: scheduledWorkoutsResponse,
          }),
        );
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

    expect(await screen.findByRole('heading', { name: 'No workouts yet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Browse Templates' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Ask your agent to build a template, then start a session from it.'),
    ).toBeInTheDocument();
  });

  it('shows a completion notice when redirected from an already-completed active session', () => {
    renderWithQueryClient(
      <MemoryRouter
        initialEntries={[
          `/workouts?${WORKOUT_SESSION_NOTICE_QUERY_KEY}=${WORKOUT_SESSION_COMPLETED_NOTICE}`,
        ]}
      >
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Session was completed on another device.')).toBeInTheDocument();
  });

  it('shows onboarding for users with no completed workouts and persists dismissal', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-templates') {
        return Promise.resolve(jsonResponse({ data: templatesResponse }));
      }

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(
          jsonResponse({
            data: url.searchParams.get('status') === 'completed' ? [] : [],
          }),
        );
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

    const view = renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <LocationProbe />
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('How workouts flow in Pulse')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Browse templates' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Templates' })).toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('?view=templates');

    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss workouts onboarding' }));
    expect(screen.queryByText('How workouts flow in Pulse')).not.toBeInTheDocument();

    view.unmount();

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('How workouts flow in Pulse')).not.toBeInTheDocument();
  });

  it('does not render onboarding create-template CTA', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-templates') {
        return Promise.resolve(jsonResponse({ data: templatesResponse }));
      }

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(
          jsonResponse({
            data: url.searchParams.get('status') === 'completed' ? [] : [],
          }),
        );
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

    expect(await screen.findByText('How workouts flow in Pulse')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create a template' })).not.toBeInTheDocument();
  });

  it('prefetches top template details when the list view is active', async () => {
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'List' }));

    expect(await screen.findByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await waitFor(() => {
      const requestUrls = vi
        .mocked(globalThis.fetch)
        .mock.calls.map(([request]) => String(request))
        .filter((request) => request.startsWith('/api/v1/workout-templates/'));

      expect(requestUrls).toContain('/api/v1/workout-templates/upper-push');
      expect(requestUrls).toContain('/api/v1/workout-templates/lower-quad-dominant');
    });
  });
});

function TemplateRouteProbe() {
  const { templateId } = useParams();

  return <h1>{`Template ${templateId}`}</h1>;
}

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location-search">{location.search}</p>;
}

function createDeferredResponse() {
  let resolve: (value: Response) => void = () => {};

  const promise = new Promise<Response>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}
