import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePersistedState } from './usePersistedState';

describe('usePersistedState', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('hydrates from localStorage when a stored value exists', () => {
    window.localStorage.setItem('persisted-key', JSON.stringify({ open: false }));

    const { result } = renderHook(() =>
      usePersistedState('persisted-key', {
        open: true,
      }),
    );

    expect(result.current[0]).toEqual({ open: false });
  });

  it('falls back to default value when localStorage contains invalid JSON', () => {
    window.localStorage.setItem('persisted-key', '{bad-json');

    const { result } = renderHook(() => usePersistedState('persisted-key', { open: true }));

    expect(result.current[0]).toEqual({ open: true });
  });

  it('persists updates with debounce', () => {
    const { result } = renderHook(() => usePersistedState('persisted-key', { open: true }));

    act(() => {
      result.current[1]({ open: false });
    });

    expect(window.localStorage.getItem('persisted-key')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(window.localStorage.getItem('persisted-key')).toBe(JSON.stringify({ open: false }));
  });

  it('scopes state by key and reloads when key changes', () => {
    window.localStorage.setItem('state-a', JSON.stringify({ open: false }));
    window.localStorage.setItem('state-b', JSON.stringify({ open: true }));

    const { result, rerender } = renderHook(
      ({ storageKey }) => usePersistedState(storageKey, { open: true }),
      {
        initialProps: {
          storageKey: 'state-a',
        },
      },
    );

    expect(result.current[0]).toEqual({ open: false });

    rerender({
      storageKey: 'state-b',
    });

    expect(result.current[0]).toEqual({ open: true });
  });

  it('does not throw when localStorage read/write fails', () => {
    const getItemSpy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('read blocked');
    });
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('write blocked');
    });

    const { result } = renderHook(() => usePersistedState('persisted-key', { open: true }));
    expect(result.current[0]).toEqual({ open: true });

    act(() => {
      result.current[1]({ open: false });
      vi.advanceTimersByTime(200);
    });

    expect(getItemSpy).toHaveBeenCalled();
    expect(setItemSpy).toHaveBeenCalled();
  });
});
