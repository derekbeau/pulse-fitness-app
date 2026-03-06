import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, useTheme } from '@/hooks/useTheme';

type MatchMediaPreference = {
  dark: boolean;
  light: boolean;
};

const createMediaQueryList = (query: string, matches: boolean): MediaQueryList =>
  ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }) as unknown as MediaQueryList;

const mockMatchMedia = (preference: MatchMediaPreference) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string): MediaQueryList => {
      if (query === '(prefers-color-scheme: dark)') {
        return createMediaQueryList(query, preference.dark);
      }

      if (query === '(prefers-color-scheme: light)') {
        return createMediaQueryList(query, preference.light);
      }

      return createMediaQueryList(query, false);
    }),
  );
};

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.remove('theme-midnight');
    mockMatchMedia({ dark: false, light: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults to dark when there is no saved or system theme preference', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
  });

  it('uses stored theme value before system preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'midnight');
    mockMatchMedia({ dark: true, light: false });

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('midnight');
  });

  it('falls back to light when system preference is light', () => {
    mockMatchMedia({ dark: false, light: true });

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
  });

  it('persists explicit midnight theme updates and applies class mapping', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('midnight');
    });

    expect(result.current.theme).toBe('midnight');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight');
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('cycles dark -> light -> midnight -> dark when toggled', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(false);

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('midnight');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight');
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(false);
  });
});
