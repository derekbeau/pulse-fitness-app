import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import { THEME_STORAGE_KEY } from '@/hooks/useTheme';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, SettingsPage } from '@/pages/settings';

function renderSettingsPage() {
  return render(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>,
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.remove('theme-midnight');
  });

  it('renders the read-only profile field, theme options, and default prototype settings', () => {
    renderSettingsPage();

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
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

  it('saves nutrition targets and dashboard selections to localStorage', () => {
    renderSettingsPage();

    fireEvent.change(screen.getByLabelText('Daily calories'), { target: { value: '2250' } });
    fireEvent.change(screen.getByLabelText('Protein (g)'), { target: { value: '175' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Hydrate/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Steps/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(screen.getByText('Nutrition targets and dashboard preferences saved.')).toBeInTheDocument();

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
