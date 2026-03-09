import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
  { heading: 'Upper Push', path: '/workouts/active' },
  { heading: 'Upper Push', path: `/workouts/session/${sessionId}` },
  { heading: 'Upper Push', path: '/workouts/template/upper-push' },
  { heading: 'Nutrition', path: '/nutrition' },
  { heading: 'Habits', path: '/habits' },
  { heading: 'Activity', path: '/activity' },
  { heading: 'Foods', path: '/foods' },
  { heading: 'Journal', path: '/journal' },
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
  { heading: 'Foods', path: '/foods' },
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

      if (url.pathname === '/api/v1/workout-templates/upper-push') {
        return Promise.resolve(jsonResponse(workoutTemplatePayload));
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

  it('renders navigation links for all app routes', () => {
    setAuthenticatedState();
    renderApp();

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
