import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark' | 'midnight';

export const THEME_STORAGE_KEY = 'pulse-theme';

const THEME_DARK_QUERY = '(prefers-color-scheme: dark)';
const THEME_LIGHT_QUERY = '(prefers-color-scheme: light)';
const THEME_CLASSES = ['dark', 'theme-light', 'theme-midnight'] as const;

const isTheme = (value: string | null): value is Theme =>
  value === 'light' || value === 'dark' || value === 'midnight';

const getSystemTheme = (): Theme => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }

  if (window.matchMedia(THEME_DARK_QUERY).matches) {
    return 'dark';
  }

  if (window.matchMedia(THEME_LIGHT_QUERY).matches) {
    return 'light';
  }

  return 'dark';
};

export const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (isTheme(storedTheme)) {
      return storedTheme;
    }
  } catch {
    // localStorage access can fail in restricted environments.
  }

  return getSystemTheme();
};

export const applyThemeClass = (theme: Theme): void => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);

  if (theme === 'dark') {
    root.classList.add('dark');
    return;
  }

  if (theme === 'midnight') {
    root.classList.add('theme-midnight');
  }
};

type SetTheme = (theme: Theme) => void;

export type UseThemeReturn = {
  theme: Theme;
  setTheme: SetTheme;
  toggleTheme: () => void;
};

export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme());

  const setTheme = useCallback<SetTheme>((nextTheme) => {
    setThemeState(nextTheme);
    applyThemeClass(nextTheme);

    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // localStorage access can fail in restricted environments.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : theme === 'light' ? 'midnight' : 'dark';
    setTheme(nextTheme);
  }, [setTheme, theme]);

  return { theme, setTheme, toggleTheme };
}
