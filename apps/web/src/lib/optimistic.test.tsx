import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { createOptimisticMutation } from './optimistic';

type TestItem = {
  id: string;
  value: string;
};

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
        throw new Error('Deferred reject handler was not initialized');
      }

      rejectDeferred(reason);
    },
    resolve: (value: T | PromiseLike<T>) => {
      if (!resolveDeferred) {
        throw new Error('Deferred resolve handler was not initialized');
      }

      resolveDeferred(value);
    },
  };
}

function useTestOptimisticMutation(mutationFn: (value: string) => Promise<TestItem>) {
  return createOptimisticMutation<
    TestItem[],
    TestItem,
    string,
    {
      optimisticItem: TestItem;
    }
  >({
    mutationFn,
    getMeta: (variables) => ({
      optimisticItem: {
        id: 'optimistic-item',
        value: variables,
      },
    }),
    invalidateKeys: () => [['items']],
    queryKey: () => [['items']],
    reconcile: (current, data) =>
      (current ?? []).map((item) => (item.id === 'optimistic-item' ? data : item)),
    updater: (current, _variables, context) => [...(current ?? []), context.meta.optimisticItem],
  });
}

describe('createOptimisticMutation', () => {
  it('snapshots cache, applies an optimistic update, and reconciles the server result', async () => {
    const deferred = createDeferredPromise<TestItem>();
    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    queryClient.setQueryData<TestItem[]>(['items'], [{ id: 'seed', value: 'before' }]);

    const { result } = renderHook(() => useTestOptimisticMutation(() => deferred.promise), {
      wrapper,
    });

    act(() => {
      result.current.mutate('after');
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<TestItem[]>(['items'])).toEqual([
        { id: 'seed', value: 'before' },
        { id: 'optimistic-item', value: 'after' },
      ]);
    });

    await act(async () => {
      deferred.resolve({ id: 'server-item', value: 'after' });
      await deferred.promise;
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<TestItem[]>(['items'])).toEqual([
        { id: 'seed', value: 'before' },
        { id: 'server-item', value: 'after' },
      ]);
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['items'] });
  });

  it('restores the exact snapshot on error instead of leaving a stale optimistic value', async () => {
    const deferred = createDeferredPromise<TestItem>();
    void deferred.promise.catch(() => undefined);
    const { queryClient, wrapper } = createQueryClientWrapper();
    const initialItems = [{ id: 'seed', value: 'before' }];

    queryClient.setQueryData<TestItem[]>(['items'], initialItems);

    const { result } = renderHook(() => useTestOptimisticMutation(() => deferred.promise), {
      wrapper,
    });

    act(() => {
      result.current.mutate('after');
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<TestItem[]>(['items'])).toEqual([
        { id: 'seed', value: 'before' },
        { id: 'optimistic-item', value: 'after' },
      ]);
    });

    queryClient.setQueryData<TestItem[]>(['items'], [{ id: 'unexpected', value: 'drifted' }]);

    act(() => {
      deferred.reject(new Error('mutation failed'));
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<TestItem[]>(['items'])).toEqual(initialItems);
    });
  });

  it('invalidates settled keys even after rollback from an error', async () => {
    const deferred = createDeferredPromise<TestItem>();
    void deferred.promise.catch(() => undefined);
    const { queryClient, wrapper } = createQueryClientWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    queryClient.setQueryData<TestItem[]>(['items'], [{ id: 'seed', value: 'before' }]);

    const { result } = renderHook(() => useTestOptimisticMutation(() => deferred.promise), {
      wrapper,
    });

    act(() => {
      result.current.mutate('after');
    });

    act(() => {
      deferred.reject(new Error('mutation failed'));
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['items'] });
  });
});
