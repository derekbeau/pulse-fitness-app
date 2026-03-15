import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Habit, HabitEntry } from '@pulse/shared';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardSnapshotQueryKeys } from '@/hooks/use-dashboard-snapshot';
import { habitChainQueryKeys } from '@/hooks/use-habit-chains';
import { apiRequest } from '@/lib/api-client';
import { createAppQueryClient } from '@/lib/query-client';

import {
  useCreateHabit,
  useDeleteHabit,
  useHabits,
  useToggleHabit,
  useUpdateHabit,
  useUpdateHabitEntry,
} from './habits';
import { habitQueryKeys } from './keys';

vi.mock('@/lib/api-client', () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

function createDeferredPromise<T>() {
  let resolveDeferred: ((value: T | PromiseLike<T>) => void) | undefined;
  let rejectDeferred: ((reason?: unknown) => void) | undefined;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolveDeferred = resolvePromise;
    rejectDeferred = rejectPromise;
  });

  return {
    promise,
    reject: (reason?: unknown) => {
      if (!rejectDeferred) {
        throw new Error('Deferred promise reject handler was not initialized');
      }

      rejectDeferred(reason);
    },
    resolve: (value: T | PromiseLike<T>) => {
      if (!resolveDeferred) {
        throw new Error('Deferred promise resolve handler was not initialized');
      }

      resolveDeferred(value);
    },
  };
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  mockedApiRequest.mockReset();
});

describe('habit api hooks', () => {
  it('requests GET /api/v1/habits and returns active habits only', async () => {
    const queryClient = createAppQueryClient();
    const wrapper = createWrapper(queryClient);
    const habits: Habit[] = [
      {
        id: 'habit-active',
        userId: 'user-1',
        name: 'Hydrate',
        description: null,
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
        todayEntry: {
          completed: true,
          isOverride: false,
          value: 8,
        },
      },
      {
        id: 'habit-archived',
        userId: 'user-1',
        name: 'Archived',
        description: null,
        emoji: '🗃️',
        trackingType: 'boolean',
        target: null,
        unit: null,
        frequency: 'daily',
        frequencyTarget: null,
        scheduledDays: null,
        pausedUntil: null,
        sortOrder: 1,
        active: false,
        createdAt: 2,
        updatedAt: 2,
        todayEntry: null,
      },
    ] as unknown as Habit[];

    mockedApiRequest.mockResolvedValueOnce(habits);

    const { result } = renderHook(() => useHabits(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockedApiRequest).toHaveBeenCalledWith(
      '/api/v1/habits',
      expect.objectContaining({
        method: 'GET',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result.current.data).toEqual([habits[0]]);
  });

  it('optimistically updates and rolls back a toggled habit entry on failure', async () => {
    const queryClient = createAppQueryClient();
    const wrapper = createWrapper(queryClient);
    const queryKey = habitQueryKeys.entryList({ from: '2026-03-07', to: '2026-03-07' });
    const chainQueryKey = habitChainQueryKeys.range('2026-02-07', '2026-03-07');
    const initialEntries: HabitEntry[] = [
      {
        id: 'entry-1',
        habitId: 'habit-1',
        userId: 'user-1',
        date: '2026-03-07',
        completed: false,
        value: null,
        createdAt: 1,
      },
    ];

    queryClient.setQueryData(queryKey, initialEntries);
    queryClient.setQueryData(chainQueryKey, initialEntries);

    const deferred = createDeferredPromise<HabitEntry>();
    void deferred.promise.catch(() => undefined);
    mockedApiRequest.mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() => useToggleHabit(), { wrapper });

    act(() => {
      result.current.mutate({
        habitId: 'habit-1',
        date: '2026-03-07',
        completed: true,
        entryId: 'entry-1',
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<HabitEntry[]>(queryKey)).toEqual([
        expect.objectContaining({
          completed: true,
          habitId: 'habit-1',
          id: 'entry-1',
        }),
      ]);
      expect(queryClient.getQueryData<HabitEntry[]>(chainQueryKey)).toEqual([
        expect.objectContaining({
          completed: true,
          habitId: 'habit-1',
          id: 'entry-1',
        }),
      ]);
    });

    act(() => {
      deferred.reject(new Error('toggle failed'));
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<HabitEntry[]>(queryKey)).toEqual(initialEntries);
      expect(queryClient.getQueryData<HabitEntry[]>(chainQueryKey)).toEqual(initialEntries);
    });
  });

  it('passes isOverride when toggling referential entries', async () => {
    const queryClient = createAppQueryClient();
    const wrapper = createWrapper(queryClient);
    const serverEntry: HabitEntry = {
      id: 'entry-3',
      habitId: 'habit-3',
      userId: 'user-1',
      date: '2026-03-07',
      completed: true,
      value: null,
      isOverride: true,
      createdAt: 3,
    };
    mockedApiRequest.mockResolvedValueOnce(serverEntry);

    const { result } = renderHook(() => useToggleHabit(), { wrapper });

    await act(async () => {
      result.current.mutate({
        habitId: 'habit-3',
        date: '2026-03-07',
        completed: true,
        isOverride: true,
      });
    });

    await waitFor(() => {
      expect(mockedApiRequest).toHaveBeenCalledWith(
        '/api/v1/habits/habit-3/entries',
        expect.objectContaining({
          body: expect.objectContaining({
            completed: true,
            date: '2026-03-07',
            isOverride: true,
          }),
          method: 'POST',
        }),
      );
    });
  });

  it('optimistically patches a tracked entry and keeps the server result on success', async () => {
    const queryClient = createAppQueryClient();
    const wrapper = createWrapper(queryClient);
    const queryKey = habitQueryKeys.entryList({ from: '2026-03-07', to: '2026-03-07' });
    const chainQueryKey = habitChainQueryKeys.range('2026-02-07', '2026-03-07');
    const initialEntries: HabitEntry[] = [
      {
        id: 'entry-2',
        habitId: 'habit-2',
        userId: 'user-1',
        date: '2026-03-07',
        completed: false,
        value: 6,
        createdAt: 2,
      },
    ];
    const updatedEntry: HabitEntry = {
      ...initialEntries[0],
      completed: true,
      value: 8,
    };

    queryClient.setQueryData(queryKey, initialEntries);
    queryClient.setQueryData(chainQueryKey, initialEntries);

    const deferred = createDeferredPromise<HabitEntry>();
    mockedApiRequest.mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() => useUpdateHabitEntry(), { wrapper });

    act(() => {
      result.current.mutate({
        id: 'entry-2',
        habitId: 'habit-2',
        date: '2026-03-07',
        completed: true,
        value: 8,
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<HabitEntry[]>(queryKey)).toEqual([
        expect.objectContaining({
          completed: true,
          id: 'entry-2',
          value: 8,
        }),
      ]);
      expect(queryClient.getQueryData<HabitEntry[]>(chainQueryKey)).toEqual([
        expect.objectContaining({
          completed: true,
          id: 'entry-2',
          value: 8,
        }),
      ]);
    });

    await act(async () => {
      deferred.resolve(updatedEntry);
      await deferred.promise;
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<HabitEntry[]>(queryKey)).toEqual([updatedEntry]);
      expect(queryClient.getQueryData<HabitEntry[]>(chainQueryKey)).toEqual([updatedEntry]);
    });
  });

  it('invalidates dashboard snapshot and chain queries after a toggle succeeds', async () => {
    const queryClient = createAppQueryClient();
    const wrapper = createWrapper(queryClient);
    const serverEntry: HabitEntry = {
      id: 'entry-4',
      habitId: 'habit-4',
      userId: 'user-1',
      date: '2026-03-08',
      completed: true,
      value: null,
      isOverride: false,
      createdAt: 4,
    };
    mockedApiRequest.mockResolvedValueOnce(serverEntry);

    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useToggleHabit(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        habitId: 'habit-4',
        date: '2026-03-08',
        completed: true,
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitQueryKeys.entryList(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitQueryKeys.list(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardSnapshotQueryKeys.all,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitChainQueryKeys.all,
    });
  });

  it('invalidates dashboard snapshot after creating a habit', async () => {
    const queryClient = createAppQueryClient();
    const wrapper = createWrapper(queryClient);
    const createdHabit: Habit = {
      id: 'habit-created',
      userId: 'user-1',
      name: 'Walk',
      description: null,
      emoji: '🚶',
      trackingType: 'boolean',
      target: null,
      unit: null,
      frequency: 'daily',
      frequencyTarget: null,
      scheduledDays: null,
      pausedUntil: null,
      sortOrder: 2,
      active: true,
      createdAt: 3,
      updatedAt: 3,
    } as Habit;
    mockedApiRequest.mockResolvedValueOnce(createdHabit);
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateHabit(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        emoji: '🚶',
        frequency: 'daily',
        name: 'Walk',
        target: null,
        trackingType: 'boolean',
        unit: null,
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardSnapshotQueryKeys.all,
    });
  });

  it('invalidates dashboard snapshot after updating a habit definition', async () => {
    const queryClient = createAppQueryClient();
    const wrapper = createWrapper(queryClient);
    const updatedHabit: Habit = {
      id: 'habit-updated',
      userId: 'user-1',
      name: 'Evening Walk',
      description: null,
      emoji: '🚶',
      trackingType: 'boolean',
      target: null,
      unit: null,
      frequency: 'daily',
      frequencyTarget: null,
      scheduledDays: null,
      pausedUntil: null,
      sortOrder: 2,
      active: true,
      createdAt: 3,
      updatedAt: 4,
    } as Habit;
    mockedApiRequest.mockResolvedValueOnce(updatedHabit);
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateHabit(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'habit-updated',
        values: {
          name: 'Evening Walk',
        },
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardSnapshotQueryKeys.all,
    });
  });

  it('invalidates dashboard snapshot after deleting a habit', async () => {
    const queryClient = createAppQueryClient();
    const wrapper = createWrapper(queryClient);
    mockedApiRequest.mockResolvedValueOnce({ success: true });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteHabit(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'habit-delete',
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dashboardSnapshotQueryKeys.all,
    });
  });
});
