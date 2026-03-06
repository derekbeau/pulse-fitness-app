import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import { THEME_STORAGE_KEY } from '@/hooks/useTheme';
import { SettingsPage } from '@/pages/settings';

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
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.remove('theme-midnight');
  });

  it('renders the read-only profile field and all theme options', () => {
    renderSettingsPage();

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveAttribute('readonly');
    expect(screen.getByPlaceholderText('User')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Light/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Dark/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Midnight/i })).toBeInTheDocument();
  });

  it('reflects the persisted theme on first render', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'midnight');

    renderSettingsPage();

    expect(screen.getByRole('radio', { name: /Midnight/i })).toBeChecked();
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
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
});
