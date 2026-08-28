import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAdaptiveNutritionState } from '@/features/adaptive-nutrition';

import { useDateAuthority } from './use-date-authority';
import { useTodayKey } from '@/features/workouts/hooks/use-today-key';

vi.mock('@/features/adaptive-nutrition', () => ({
  useAdaptiveNutritionState: vi.fn(),
}));

const mockedUseAdaptiveNutritionState = vi.mocked(useAdaptiveNutritionState);
const refetch = vi.fn().mockResolvedValue(undefined);

function authorityQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      localDate: '2026-03-08',
      timeZone: 'America/Detroit',
    },
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    isRefetchError: false,
    refetch,
    ...overrides,
  } as unknown as ReturnType<typeof useAdaptiveNutritionState>;
}

describe('useDateAuthority', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T03:59:58.000Z'));
    refetch.mockClear();
    mockedUseAdaptiveNutritionState.mockReturnValue(authorityQuery());
  });

  afterEach(() => {
    vi.useRealTimers();
    mockedUseAdaptiveNutritionState.mockReset();
  });

  it('refreshes at the resolved local midnight and when the page returns to the foreground', () => {
    renderHook(() => useDateAuthority());

    act(() => vi.advanceTimersByTime(2_000));
    expect(refetch).toHaveBeenCalledTimes(1);

    act(() => window.dispatchEvent(new Event('focus')));
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the last verified date visible but locks writes after a refetch error', () => {
    mockedUseAdaptiveNutritionState.mockReturnValue(
      authorityQuery({ isError: true, isRefetchError: true }),
    );
    const { result } = renderHook(() => useDateAuthority());

    expect(result.current.localDate).toBe('2026-03-08');
    expect(result.current.isStale).toBe(true);
    expect(result.current.isLocked).toBe(true);
    const workoutDate = renderHook(() => useTodayKey()).result.current;
    expect(workoutDate.todayKey).toBe('2026-03-08');
    expect(workoutDate.dateAuthorityLocked).toBe(true);
    expect(workoutDate.getTodayKeyForMutation()).toBeNull();
  });

  it('distinguishes an initial transport error from unresolved setup truth', () => {
    mockedUseAdaptiveNutritionState.mockReturnValue(
      authorityQuery({ data: undefined, isError: true, isRefetchError: false }),
    );
    const { result } = renderHook(() => useDateAuthority());

    expect(result.current.isInitialError).toBe(true);
    expect(result.current.localDate).toBeNull();
    expect(result.current.isLocked).toBe(true);
  });
});
