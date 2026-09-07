import { act, renderHook, waitFor } from '@testing-library/react';
import type { DailyNutrition } from '@pulse/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';
import { nutritionQueryKeys } from './keys';
import { useUpdateNutritionNote } from './nutrition';

const date = '2026-03-05';
const previous: DailyNutrition = {
  log: {
    id: 'log',
    userId: 'user',
    date,
    notes: 'Original',
    status: 'complete',
    statusUpdatedAt: 10,
    createdAt: 1,
    updatedAt: 10,
  },
  meals: [],
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('day-note query lifecycle', () => {
  it.each([false, true])(
    'cancels day reads and invalidates just note consumers (failure=%s)',
    async (fail) => {
      let release!: (value: Response) => void;
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              release = resolve;
            }),
        ),
      );
      const { wrapper, queryClient } = createQueryClientWrapper();
      queryClient.setQueryData(nutritionQueryKeys.day(date), previous);
      const cancel = vi.spyOn(queryClient, 'cancelQueries');
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => useUpdateNutritionNote(), { wrapper });
      act(() => result.current.mutate({ date, notes: '  New note  ' }));
      await waitFor(() =>
        expect(
          queryClient.getQueryData<DailyNutrition>(nutritionQueryKeys.day(date))?.log.notes,
        ).toBe('New note'),
      );
      expect(cancel).toHaveBeenCalledWith({ queryKey: nutritionQueryKeys.day(date) });
      // An unrelated meal edit during the request must survive a note rollback.
      const current = queryClient.getQueryData<DailyNutrition>(nutritionQueryKeys.day(date));
      if (!current) throw new Error('Expected a cached day');
      queryClient.setQueryData(nutritionQueryKeys.day(date), {
        ...current,
        log: { ...current.log, status: 'partial' },
      });
      await act(async () =>
        release(
          new Response(
            JSON.stringify(
              fail
                ? { error: { code: 'FAIL', message: 'Fixture failure' } }
                : { data: { ...previous, log: { ...previous.log, notes: 'New note' } } },
            ),
            { status: fail ? 500 : 200 },
          ),
        ),
      );
      await waitFor(() => expect(result.current.isPending).toBe(false));
      const data = queryClient.getQueryData<DailyNutrition>(nutritionQueryKeys.day(date));
      expect(data?.log.notes).toBe(fail ? 'Original' : 'New note');
      if (fail) expect(data?.log.status).toBe('partial');
      expect(invalidate.mock.calls.map(([arg]) => arg?.queryKey)).toEqual([
        nutritionQueryKeys.day(date),
        nutritionQueryKeys.summary(date),
        nutritionQueryKeys.weekSummary(date),
        nutritionQueryKeys.loggingContexts,
      ]);
    },
  );

  it('does not fabricate a log or status when an absent-day save fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'FAIL', message: 'Fixture failure' } }), {
            status: 500,
          }),
      ),
    );
    const { wrapper, queryClient } = createQueryClientWrapper();
    queryClient.setQueryData(nutritionQueryKeys.day(date), null);
    const { result } = renderHook(() => useUpdateNutritionNote(), { wrapper });
    act(() => result.current.mutate({ date, notes: 'New note' }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(nutritionQueryKeys.day(date))).toBeNull();
  });
});

it('does not reinsert another account note after the cache is cleared during a save', async () => {
  let release!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ),
  );
  const { wrapper, queryClient } = createQueryClientWrapper();
  queryClient.setQueryData(nutritionQueryKeys.day(date), previous);
  const { result } = renderHook(() => useUpdateNutritionNote(), { wrapper });
  act(() => result.current.mutate({ date, notes: 'Previous account note' }));
  await waitFor(() => expect(release).toBeDefined());
  queryClient.clear();
  queryClient.setQueryData(nutritionQueryKeys.day(date), null);
  await act(async () =>
    release(
      new Response(
        JSON.stringify({
          data: { ...previous, log: { ...previous.log, notes: 'Previous account note' } },
        }),
        { status: 200 },
      ),
    ),
  );
  await waitFor(() => expect(result.current.isPending).toBe(false));
  expect(queryClient.getQueryData(nutritionQueryKeys.day(date))).toBeNull();
});
