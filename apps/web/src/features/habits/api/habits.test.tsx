import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { HabitEntry } from '@pulse/shared';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '@/lib/api-client';
import { createAppQueryClient } from '@/lib/query-client';

import { useToggleHabit, useUpdateHabitEntry } from './habits';
import { habitKeys } from './keys';

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
  it('optimistically updates and rolls back a toggled habit entry on failure', async () => {
    const queryClient = createAppQueryClient();
    const wrapper = createWrapper(queryClient);
    const queryKey = habitKeys.entries({ from: '2026-03-07', to: '2026-03-07' });
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
    });

    act(() => {
      deferred.reject(new Error('toggle failed'));
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<HabitEntry[]>(queryKey)).toEqual(initialEntries);
    });
  });

  it('optimistically patches a tracked entry and keeps the server result on success', async () => {
    const queryClient = createAppQueryClient();
    const wrapper = createWrapper(queryClient);
    const queryKey = habitKeys.entries({ from: '2026-03-07', to: '2026-03-07' });
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
    });

    await act(async () => {
      deferred.resolve(updatedEntry);
      await deferred.promise;
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<HabitEntry[]>(queryKey)).toEqual([updatedEntry]);
    });
  });
});
