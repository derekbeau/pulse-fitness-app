import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import { THEME_STORAGE_KEY } from '@/hooks/useTheme';
import { useThemeContext } from '@/hooks/useThemeContext';

const mockMatchMedia = () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string): MediaQueryList => {
      return {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      } as unknown as MediaQueryList;
    }),
  );
};

function ThemeToggleHarness() {
  const { theme, toggleTheme } = useThemeContext();

  return (
    <div>
      <p data-testid="theme-value">{theme}</p>
      <button type="button" onClick={toggleTheme}>
        toggle theme
      </button>
    </div>
  );
}

describe('Theme toggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.remove('theme-midnight');
    mockMatchMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('toggles the dark class on document.documentElement when cycling themes', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'midnight');

    render(
      <ThemeProvider>
        <ThemeToggleHarness />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button', { name: 'toggle theme' });

    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fireEvent.click(button);

    expect(document.documentElement.classList.contains('dark')).toBe(true);

    fireEvent.click(button);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists theme preference to localStorage when toggled', () => {
    render(
      <ThemeProvider>
        <ThemeToggleHarness />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button', { name: 'toggle theme' });

    fireEvent.click(button);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    fireEvent.click(button);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight');
  });

  it('reads the initial theme from localStorage on mount', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');

    render(
      <ThemeProvider>
        <ThemeToggleHarness />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme-value')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(false);
  });
});
