import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import { THEME_STORAGE_KEY } from '@/hooks/useTheme';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, SettingsPage } from '@/pages/settings';
import { createQueryClientWrapper } from '@/test/query-client';

type TestState = {
  dashboardConfig: {
    habitChainIds: string[];
    trendMetrics: Array<'weight' | 'calories' | 'protein'>;
    visibleWidgets?: string[];
    widgetOrder?: string[];
  };
  habits: Array<{
    id: string;
    userId: string;
    name: string;
    emoji: string | null;
    trackingType: 'boolean' | 'numeric' | 'time';
    target: number | null;
    unit: string | null;
    frequency: 'daily' | 'weekly' | 'specific_days';
    frequencyTarget: number | null;
    scheduledDays: number[] | null;
    pausedUntil: string | null;
    sortOrder: number;
    active: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
  nutritionCurrent: {
    id: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    effectiveDate: string;
    createdAt: number;
    updatedAt: number;
  } | null;
  shouldFailDashboardSave: boolean;
  shouldFailNutritionSave: boolean;
  shouldFailProfileSave: boolean;
  user: {
    id: string;
    username: string;
    name: string | null;
    weightUnit: 'kg' | 'lbs';
    createdAt: number;
  };
};

function renderSettingsPage() {
  const { wrapper } = createQueryClientWrapper();

  return render(
    <MemoryRouter>
      <ThemeProvider>
        <SettingsPage />
      </ThemeProvider>
    </MemoryRouter>,
    { wrapper },
  );
}

function getLatestPostBody(pathFragment: string) {
  const call = vi
    .mocked(fetch)
    .mock.calls.filter(([url, init]) => {
      const raw = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      const method = init?.method?.toUpperCase();
      return raw.includes(pathFragment) && method !== undefined && method !== 'GET';
    })
    .at(-1);

  if (!call) {
    throw new Error(`No request call captured for ${pathFragment}`);
  }

  const [, init] = call;
  return init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
}

describe('SettingsPage', () => {
  let state: TestState;

  beforeEach(() => {
    state = {
      dashboardConfig: {
        habitChainIds: ['habit-hydrate'],
        trendMetrics: ['weight', 'calories', 'protein'],
      },
      habits: [
        {
          id: 'habit-hydrate',
          userId: 'user-1',
          name: 'Hydrate',
          emoji: '💧',
          trackingType: 'numeric',
          target: 8,
          unit: 'glasses',
          frequency: 'daily',
          frequencyTarget: null,
          scheduledDays: null,
          pausedUntil: null,
          sortOrder: 0,
          active: true,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'habit-sleep',
          userId: 'user-1',
          name: 'Sleep',
          emoji: '😴',
          trackingType: 'time',
          target: 8,
          unit: 'hours',
          frequency: 'daily',
          frequencyTarget: null,
          scheduledDays: null,
          pausedUntil: null,
          sortOrder: 1,
          active: true,
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      nutritionCurrent: null,
      shouldFailDashboardSave: false,
      shouldFailNutritionSave: false,
      shouldFailProfileSave: false,
      user: {
        id: 'user-1',
        username: 'jordan',
        name: 'Jordan Lee',
        weightUnit: 'lbs',
        createdAt: 1_713_225_600_000,
      },
    };

    window.localStorage.removeItem(THEME_STORAGE_KEY);
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.remove('theme-midnight');

    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const rawUrl =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(rawUrl, 'http://localhost');

        if (url.pathname === '/api/v1/nutrition-targets/current') {
          return Promise.resolve(
            new Response(JSON.stringify({ data: state.nutritionCurrent }), {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            }),
          );
        }

        if (url.pathname === '/api/v1/nutrition-targets' && init?.method === 'POST') {
          if (state.shouldFailNutritionSave) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'Unavailable' } }),
                {
                  headers: { 'Content-Type': 'application/json' },
                  status: 503,
                },
              ),
            );
          }

          return Promise.resolve(
            new Response(JSON.stringify({ data: JSON.parse(String(init.body)) }), {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            }),
          );
        }

        if (url.pathname === '/api/v1/dashboard/config' && init?.method === 'GET') {
          return Promise.resolve(
            new Response(JSON.stringify({ data: state.dashboardConfig }), {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            }),
          );
        }

        if (url.pathname === '/api/v1/dashboard/config' && init?.method === 'PUT') {
          if (state.shouldFailDashboardSave) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'Unavailable' } }),
                {
                  headers: { 'Content-Type': 'application/json' },
                  status: 503,
                },
              ),
            );
          }

          state.dashboardConfig = JSON.parse(String(init.body)) as TestState['dashboardConfig'];
          return Promise.resolve(
            new Response(JSON.stringify({ data: state.dashboardConfig }), {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            }),
          );
        }

        if (url.pathname === '/api/v1/habits' && init?.method === 'GET') {
          return Promise.resolve(
            new Response(JSON.stringify({ data: state.habits }), {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            }),
          );
        }

        if (url.pathname === '/api/v1/users/me' && (!init?.method || init.method === 'GET')) {
          return Promise.resolve(
            new Response(JSON.stringify({ data: state.user }), {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            }),
          );
        }

        if (url.pathname === '/api/v1/users/me' && init?.method === 'PATCH') {
          if (state.shouldFailProfileSave) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'Unavailable' } }),
                {
                  headers: { 'Content-Type': 'application/json' },
                  status: 503,
                },
              ),
            );
          }

          const body = JSON.parse(String(init.body)) as { name?: string; weightUnit?: 'kg' | 'lbs' };
          state.user = {
            ...state.user,
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.weightUnit !== undefined ? { weightUnit: body.weightUnit } : {}),
          };
          return Promise.resolve(
            new Response(JSON.stringify({ data: state.user }), {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            }),
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify({ data: null }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders defaults and loads dashboard config from API', async () => {
    renderSettingsPage();

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByLabelText('Daily calories')).toHaveValue(
      DEFAULT_SETTINGS.nutritionTargets.calories,
    );

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Hydrate/i })).toBeChecked();
    });

    expect(screen.getByRole('checkbox', { name: /Sleep/i })).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /Track your recent body weight direction/i }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /Track your daily calorie intake trend/i }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /Track your daily protein intake trend/i }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /Daily Snapshot.*daily body weight/i }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /Date Picker.*date picker for navigating/i }),
    ).toBeChecked();
  });

  it('reflects persisted widget visibility choices from dashboard config', async () => {
    state.dashboardConfig.visibleWidgets = ['weight-trend', 'recent-workouts'];

    renderSettingsPage();

    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Daily Snapshot.*daily body weight/i }),
      ).not.toBeChecked();
    });

    expect(screen.getByRole('checkbox', { name: /Weight Trend/i })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /Recent Workouts.*latest workout sessions/i }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /Date Picker.*date picker for navigating/i }),
    ).not.toBeChecked();
  });

  it('reflects the persisted theme on first render', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'midnight');

    renderSettingsPage();

    expect(screen.getByRole('radio', { name: /Midnight/i })).toBeChecked();
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('saves nutrition targets and dashboard config via API', async () => {
    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Hydrate/i })).toBeChecked();
    });

    fireEvent.change(screen.getByLabelText('Daily calories'), { target: { value: '2250' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Sleep/i }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Track your recent body weight direction/i }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Date Picker.*date picker for navigating/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(
        screen.getByText('Nutrition targets and dashboard preferences saved.'),
      ).toBeInTheDocument();
    });

    expect(getLatestPostBody('/api/v1/nutrition-targets')).toEqual({
      calories: 2250,
      carbs: 250,
      effectiveDate: new Date().toISOString().slice(0, 10),
      fat: 65,
      protein: 150,
    });

    expect(getLatestPostBody('/api/v1/dashboard/config')).toEqual({
      habitChainIds: ['habit-hydrate', 'habit-sleep'],
      trendMetrics: ['calories', 'protein'],
      visibleWidgets: DEFAULT_SETTINGS.dashboardConfig.visibleWidgets.filter(
        (widgetId) => widgetId !== 'calendar',
      ),
    });
  });

  it('shows a partial failure message when dashboard config save fails', async () => {
    state.shouldFailDashboardSave = true;

    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Hydrate/i })).toBeChecked();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Dashboard preferences could not be saved right now. Nutrition targets were saved.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('shows a partial failure message when nutrition target save fails', async () => {
    state.shouldFailNutritionSave = true;

    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Hydrate/i })).toBeChecked();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Nutrition targets could not be saved right now. Dashboard preferences were saved.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('shows the user profile with real data from the API', async () => {
    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Display name')).toHaveValue('Jordan Lee');
    });

    expect(screen.getByText('jordan')).toBeInTheDocument();
    expect(screen.getByText('Member since')).toBeInTheDocument();
    expect(screen.getByText('April 2024')).toBeInTheDocument();
  });

  it('saves profile changes via PATCH /api/v1/users/me', async () => {
    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Display name')).toHaveValue('Jordan Lee');
    });

    fireEvent.change(screen.getByLabelText('Display name'), {
      target: { value: 'Jordan Updated' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      expect(screen.getByText('Profile updated.')).toBeInTheDocument();
    });

    expect(getLatestPostBody('/api/v1/users/me')).toEqual({
      name: 'Jordan Updated',
      weightUnit: 'lbs',
    });
  });

  it('saves weight unit changes via PATCH /api/v1/users/me', async () => {
    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Display name')).toHaveValue('Jordan Lee');
    });

    fireEvent.click(screen.getByRole('radio', { name: 'kg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      expect(screen.getByText('Profile updated.')).toBeInTheDocument();
    });

    expect(getLatestPostBody('/api/v1/users/me')).toEqual({
      name: 'Jordan Lee',
      weightUnit: 'kg',
    });
  });

  it('shows an error message when profile save fails', async () => {
    state.shouldFailProfileSave = true;

    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Display name')).toHaveValue('Jordan Lee');
    });

    fireEvent.change(screen.getByLabelText('Display name'), {
      target: { value: 'Jordan With Error' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      expect(screen.getByText('Could not save profile. Please try again.')).toBeInTheDocument();
    });
  });
});
