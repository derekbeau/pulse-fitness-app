import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import { THEME_STORAGE_KEY } from '@/hooks/useTheme';
import { createQueryClientWrapper } from '@/test/query-client';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, SettingsPage } from '@/pages/settings';

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

describe('SettingsPage', () => {
  beforeEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.remove('theme-midnight');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;

        if (url.includes('/api/v1/nutrition-targets/current')) {
          return Promise.resolve(
            new Response(JSON.stringify({ data: null }), {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            }),
          );
        }

        if (url.includes('/api/v1/nutrition-targets') && init?.method === 'POST') {
          return Promise.resolve(
            new Response(JSON.stringify({ data: JSON.parse(String(init.body)) }), {
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

  it('renders the read-only profile field, theme options, and default prototype settings', () => {
    renderSettingsPage();

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Profile/i })).toHaveAttribute(
      'href',
      '/profile',
    );
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveAttribute('readonly');
    expect(screen.getByPlaceholderText('User')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Light/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Dark/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Midnight/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nutrition Targets' })).toBeInTheDocument();
    expect(screen.getByLabelText('Daily calories')).toHaveValue(
      DEFAULT_SETTINGS.nutritionTargets.calories,
    );
    expect(screen.getByLabelText('Protein (g)')).toHaveValue(
      DEFAULT_SETTINGS.nutritionTargets.protein,
    );
    expect(screen.getByLabelText('Carbs (g)')).toHaveValue(DEFAULT_SETTINGS.nutritionTargets.carbs);
    expect(screen.getByLabelText('Fat (g)')).toHaveValue(DEFAULT_SETTINGS.nutritionTargets.fat);
    expect(screen.getByRole('heading', { name: 'Dashboard Configuration' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Hydrate/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Take vitamins/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Protein goal/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Weight/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Steps/i })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeInTheDocument();
  });

  it('reflects the persisted theme on first render', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'midnight');

    renderSettingsPage();

    expect(screen.getByRole('radio', { name: /Midnight/i })).toBeChecked();
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('restores saved nutrition targets and dashboard selections on first render', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        dashboardConfig: {
          habitChains: ['sleep'],
          trendSparklines: ['Steps'],
        },
        nutritionTargets: {
          calories: 2350,
          carbs: 275,
          fat: 70,
          protein: 180,
        },
      }),
    );

    renderSettingsPage();

    expect(screen.getByLabelText('Daily calories')).toHaveValue(2350);
    expect(screen.getByLabelText('Protein (g)')).toHaveValue(180);
    expect(screen.getByLabelText('Carbs (g)')).toHaveValue(275);
    expect(screen.getByLabelText('Fat (g)')).toHaveValue(70);
    expect(screen.getByRole('checkbox', { name: /Sleep/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Hydrate/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Steps/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Weight/i })).not.toBeChecked();
  });

  it('applies and persists theme changes immediately', () => {
    renderSettingsPage();

    fireEvent.click(screen.getByRole('radio', { name: /Midnight/i }));

    expect(screen.getByRole('radio', { name: /Midnight/i })).toBeChecked();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight');
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fireEvent.click(screen.getByRole('radio', { name: /Light/i }));

    expect(screen.getByRole('radio', { name: /Light/i })).toBeChecked();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('saves nutrition targets and dashboard selections to localStorage', async () => {
    renderSettingsPage();

    fireEvent.change(screen.getByLabelText('Daily calories'), { target: { value: '2250' } });
    fireEvent.change(screen.getByLabelText('Protein (g)'), { target: { value: '175' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Hydrate/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Steps/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(
        screen.getByText('Nutrition targets and dashboard preferences saved.'),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '')).toEqual({
        dashboardConfig: {
          habitChains: ['vitamins', 'protein'],
          trendSparklines: ['Weight', 'Calories', 'Protein', 'Steps'],
        },
        nutritionTargets: {
          calories: 2250,
          carbs: 250,
          fat: 65,
          protein: 175,
        },
      });
    });
  });

  it('loads current nutrition targets from the API when they exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;

        if (url.includes('/api/v1/nutrition-targets/current')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: {
                  id: 'target-current',
                  calories: 2400,
                  protein: 195,
                  carbs: 280,
                  fat: 80,
                  effectiveDate: '2026-03-07',
                  createdAt: 1,
                  updatedAt: 1,
                },
              }),
              { headers: { 'Content-Type': 'application/json' }, status: 200 },
            ),
          );
        }

        if (url.includes('/api/v1/nutrition-targets') && init?.method === 'POST') {
          return Promise.resolve(
            new Response(JSON.stringify({ data: JSON.parse(String(init.body)) }), {
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

    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Daily calories')).toHaveValue(2400);
    });

    expect(screen.getByLabelText('Protein (g)')).toHaveValue(195);
    expect(screen.getByLabelText('Carbs (g)')).toHaveValue(280);
    expect(screen.getByLabelText('Fat (g)')).toHaveValue(80);
  });
});
