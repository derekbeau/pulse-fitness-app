import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import { THEME_STORAGE_KEY } from '@/hooks/useTheme';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, SettingsPage } from '@/pages/settings';
import { createQueryClientWrapper } from '@/test/query-client';

vi.mock('@/features/habits', async () => {
  const actual = await vi.importActual<typeof import('@/features/habits')>('@/features/habits');

  return {
    ...actual,
    HabitSettings: () => <div data-testid="habit-settings" />,
  };
});

type TestState = {
  dashboardConfig: {
    habitChainIds: string[];
    trendMetrics: Array<'weight' | 'calories' | 'protein'>;
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
    sortOrder: number;
    active: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
  nutritionCurrent:
    | {
        id: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        effectiveDate: string;
        createdAt: number;
        updatedAt: number;
      }
    | null;
  shouldFailDashboardSave: boolean;
  shouldFailNutritionSave: boolean;
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
          sortOrder: 1,
          active: true,
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      nutritionCurrent: null,
      shouldFailDashboardSave: false,
      shouldFailNutritionSave: false,
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
    expect(screen.getByRole('checkbox', { name: /Weight/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Calories/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Protein/i })).toBeChecked();
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
    fireEvent.click(screen.getByRole('checkbox', { name: /Weight/i }));
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
});
