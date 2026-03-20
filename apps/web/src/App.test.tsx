import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { ThemeProvider } from '@/components/theme-provider';
import { ACTIVE_WORKOUT_SESSION_STORAGE_KEY } from '@/features/workouts/lib/session-persistence';
import { workoutCompletedSessions } from '@/features/workouts';
import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { createAppQueryClient } from '@/lib/query-client';
import { useAuthStore } from '@/store/auth-store';
import { jsonResponse } from '@/test/test-utils';

const sessionId = workoutCompletedSessions[0]?.id ?? 'session-upper-push-2026-03-02';

const guestRoutes = [
  { heading: 'Welcome back', path: '/login' },
  { heading: 'Create account', path: '/register' },
] as const;

const protectedRoutes = [
  { heading: 'Dashboard', path: '/' },
  { heading: 'Design System', path: '/design-system' },
  { heading: 'Workouts', path: '/workouts' },
  { heading: 'No active workout', path: '/workouts/active' },
  { heading: 'Upper Push', path: `/workouts/session/${sessionId}` },
  { heading: 'Upper Push', path: '/workouts/template/upper-push' },
  { heading: 'Nutrition', path: '/nutrition' },
  { heading: 'Habits', path: '/habits' },
  { heading: 'Activity', path: '/activity' },
  { heading: 'Nutrition', path: '/foods' },
  { heading: 'Journal', path: '/journal' },
  { heading: 'Weight History', path: '/weight' },
  { heading: 'Profile', path: '/profile' },
  { heading: 'Equipment', path: '/profile/equipment' },
  { heading: 'Health Tracking', path: '/profile/injuries' },
  { heading: 'Resources', path: '/profile/resources' },
  { heading: 'McGill Big 3', path: '/profile/resources/mcgill-big-3' },
  { heading: 'Settings', path: '/settings' },
] as const;

const navRoutes = [
  { heading: 'Dashboard', path: '/' },
  { heading: 'Workouts', path: '/workouts' },
  { heading: 'Nutrition', path: '/nutrition' },
  { heading: 'Habits', path: '/habits' },
  { heading: 'Activity', path: '/activity' },
  { heading: 'Journal', path: '/journal' },
  { heading: 'Profile', path: '/profile' },
] as const;

const workoutTemplatePayload = {
  data: {
    id: 'upper-push',
    userId: 'user-1',
    name: 'Upper Push',
    description: 'Chest, shoulders, and triceps emphasis with controlled tempo work.',
    tags: ['upper body', 'push'],
    sections: [
      { type: 'warmup', exercises: [] },
      { type: 'main', exercises: [] },
      { type: 'cooldown', exercises: [] },
    ],
    createdAt: 1,
    updatedAt: 1,
  },
};

const completedSessionsPayload = {
  data: [
    {
      id: sessionId,
      name: 'Upper Push',
      date: '2026-03-02',
      status: 'completed',
      templateId: 'upper-push',
      templateName: 'Upper Push',
      startedAt: Date.parse('2026-03-02T18:00:00Z'),
      completedAt: Date.parse('2026-03-02T19:00:00Z'),
      duration: 60,
      exerciseCount: 3,
      createdAt: 1,
    },
  ],
};

const workoutSessionPayload = {
  data: {
    id: sessionId,
    userId: 'user-1',
    templateId: 'upper-push',
    name: 'Upper Push',
    date: '2026-03-02',
    status: 'completed',
    startedAt: Date.parse('2026-03-02T18:00:00Z'),
    completedAt: Date.parse('2026-03-02T19:00:00Z'),
    duration: 60,
    timeSegments: [
      {
        start: '2026-03-02T18:00:00.000Z',
        end: '2026-03-02T19:00:00.000Z',
      },
    ],
    feedback: {
      energy: 4,
      recovery: 4,
      technique: 4,
      notes: 'Solid session',
    },
    notes: 'Felt good.',
    sets: [
      {
        id: 'set-1',
        exerciseId: 'incline-dumbbell-press',
        setNumber: 1,
        weight: 50,
        reps: 10,
        completed: true,
        skipped: false,
        section: 'main',
        notes: null,
        createdAt: 1,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  },
};

function renderApp() {
  const queryClient = createAppQueryClient();
  queryClient.clear();

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function setGuestState() {
  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    hasHydrated: true,
    isLoading: false,
    error: null,
  });
}

function setAuthenticatedState() {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  useAuthStore.setState({
    user: {
      id: 'user-1',
      username: 'derek',
      name: 'Derek',
    },
    token: 'test-token',
    isAuthenticated: true,
    hasHydrated: true,
    isLoading: false,
    error: null,
  });
}

describe('App', () => {
  beforeEach(() => {
    createAppQueryClient().clear();
    window.localStorage.removeItem('pulse-theme');
    window.localStorage.removeItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY);
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.remove('theme-midnight');
    window.history.pushState({}, '', '/');

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/users/me') {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'user-1',
              username: 'derek',
              name: 'Derek',
              weightUnit: 'lbs',
              createdAt: 1,
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-templates/upper-push') {
        return Promise.resolve(jsonResponse(workoutTemplatePayload));
      }

      if (url.pathname === '/api/v1/workout-templates') {
        return Promise.resolve(
          jsonResponse({
            data: [workoutTemplatePayload.data],
          }),
        );
      }

      if (
        url.pathname === '/api/v1/workout-sessions' &&
        url.searchParams.get('status') === 'completed'
      ) {
        return Promise.resolve(jsonResponse(completedSessionsPayload));
      }

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(
          jsonResponse({
            data: [],
          }),
        );
      }

      if (url.pathname === '/api/v1/weight') {
        return Promise.resolve(
          jsonResponse({
            data: [],
          }),
        );
      }

      if (url.pathname === '/api/v1/nutrition/week-summary') {
        return Promise.resolve(
          jsonResponse({
            data: [],
          }),
        );
      }

      if (/^\/api\/v1\/nutrition\/\d{4}-\d{2}-\d{2}\/summary$/.test(url.pathname)) {
        return Promise.resolve(
          jsonResponse({
            data: {
              date: '2026-03-06',
              meals: 0,
              actual: {
                calories: 0,
                protein: 0,
                carbs: 0,
                fat: 0,
              },
              target: null,
            },
          }),
        );
      }

      if (/^\/api\/v1\/nutrition\/\d{4}-\d{2}-\d{2}$/.test(url.pathname)) {
        return Promise.resolve(
          jsonResponse({
            data: null,
          }),
        );
      }

      if (url.pathname === '/api/v1/foods') {
        return Promise.resolve(
          jsonResponse({
            data: [],
            meta: {
              page: Number(url.searchParams.get('page') ?? '1'),
              limit: Number(url.searchParams.get('limit') ?? '12'),
              total: 0,
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/dashboard/trends/macros') {
        return Promise.resolve(
          jsonResponse({
            data: [],
          }),
        );
      }

      if (url.pathname.startsWith('/api/v1/workout-sessions/')) {
        return Promise.resolve(jsonResponse(workoutSessionPayload));
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

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    setGuestState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(guestRoutes)(
    'renders $heading page for $path when signed out',
    async ({ heading, path }) => {
      window.history.pushState({}, '', path);

      renderApp();

      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    },
  );

  it.each(protectedRoutes)(
    'renders $heading page for $path when signed in',
    async ({ heading, path }) => {
      setAuthenticatedState();
      window.history.pushState({}, '', path);

      renderApp();

      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    },
  );

  it('redirects /foods to /nutrition?view=foods when signed in', async () => {
    setAuthenticatedState();
    window.history.pushState({}, '', '/foods');

    renderApp();

    expect(await screen.findByRole('heading', { name: 'Nutrition' })).toBeInTheDocument();
    expect(await screen.findByText('Search your foods database')).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.pathname).toBe('/nutrition');
      expect(window.location.search).toBe('?view=foods');
    });
  });

  it('renders navigation links for all app routes', async () => {
    setAuthenticatedState();
    renderApp();

    await screen.findAllByRole('link', { name: /^Dashboard$/i });

    navRoutes.forEach(({ heading, path }) => {
      const links = screen.getAllByRole('link', {
        name: new RegExp(`^${heading}$`, 'i'),
      });

      expect(links.some((link) => link.getAttribute('href') === path)).toBe(true);
    });

    expect(screen.queryByRole('link', { name: /^Settings$/i })).not.toBeInTheDocument();
  });

  it.each(['/login', '/register'])('renders %s as a standalone auth page', (path) => {
    setGuestState();
    window.history.pushState({}, '', path);

    renderApp();

    expect(screen.queryByRole('link', { name: /^Dashboard$/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Desktop navigation' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument();
  });
});
