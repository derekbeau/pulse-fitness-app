import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { habitEntrySchema, habitSchema, type HabitEntry } from '@pulse/shared';
import { z } from 'zod';

import { apiRequest } from '@/lib/api-client';

import { habitKeys } from './keys';

const habitsSchema = z.array(habitSchema);
const habitEntriesSchema = z.array(habitEntrySchema);
const habitEntriesKeyPrefix = [...habitKeys.all, 'entries'] as const;

type HabitEntriesParams = {
  from: string;
  to: string;
};

type ToggleHabitVariables = {
  habitId: string;
  date: string;
  completed: boolean;
  entryId?: string | null;
  value?: number;
};

type UpdateHabitEntryVariables = {
  id: string;
  habitId: string;
  date: string;
  completed?: boolean;
  value?: number;
};

type HabitEntryQuerySnapshot = Array<readonly [QueryKey, HabitEntry[] | undefined]>;

type MutationContext = {
  optimisticEntry: HabitEntry;
  previousEntries: HabitEntryQuerySnapshot;
};

const compareHabitEntries = (left: HabitEntry, right: HabitEntry) =>
  left.date.localeCompare(right.date) ||
  left.createdAt - right.createdAt ||
  left.id.localeCompare(right.id);

const isHabitEntriesParams = (value: unknown): value is HabitEntriesParams => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'from' in value &&
    typeof value.from === 'string' &&
    'to' in value &&
    typeof value.to === 'string'
  );
};

const getEntriesParamsFromQueryKey = (queryKey: QueryKey): HabitEntriesParams | null => {
  const maybeParams = queryKey[2];
  return isHabitEntriesParams(maybeParams) ? maybeParams : null;
};

const snapshotHabitEntryQueries = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.getQueriesData<HabitEntry[]>({
    queryKey: habitEntriesKeyPrefix,
  });

const restoreHabitEntryQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  snapshot: HabitEntryQuerySnapshot,
) => {
  snapshot.forEach(([queryKey, entries]) => {
    queryClient.setQueryData(queryKey, entries);
  });
};

const upsertHabitEntry = (entries: HabitEntry[] | undefined, nextEntry: HabitEntry) => {
  const currentEntries = entries ?? [];
  const existingIndex = currentEntries.findIndex(
    (entry) =>
      entry.id === nextEntry.id ||
      (entry.habitId === nextEntry.habitId && entry.date === nextEntry.date),
  );

  if (existingIndex === -1) {
    return [...currentEntries, nextEntry].sort(compareHabitEntries);
  }

  const nextEntries = [...currentEntries];
  nextEntries[existingIndex] = nextEntry;
  return nextEntries.sort(compareHabitEntries);
};

const applyHabitEntryToCache = (
  queryClient: ReturnType<typeof useQueryClient>,
  nextEntry: HabitEntry,
) => {
  snapshotHabitEntryQueries(queryClient).forEach(([queryKey, entries]) => {
    const params = getEntriesParamsFromQueryKey(queryKey);
    if (!params || nextEntry.date < params.from || nextEntry.date > params.to) {
      return;
    }

    queryClient.setQueryData(queryKey, upsertHabitEntry(entries, nextEntry));
  });
};

const findCachedHabitEntry = (
  queryClient: ReturnType<typeof useQueryClient>,
  entryId: string,
): HabitEntry | undefined => {
  for (const [, entries] of snapshotHabitEntryQueries(queryClient)) {
    const match = entries?.find((entry) => entry.id === entryId);
    if (match) {
      return match;
    }
  }

  return undefined;
};

export function useHabits() {
  return useQuery({
    queryFn: ({ signal }) =>
      apiRequest('/api/v1/habits', {
        method: 'GET',
        schema: habitsSchema,
        signal,
      }),
    queryKey: habitKeys.list(),
    select: (habits) => habits.filter((habit) => habit.active),
  });
}

export function useHabitEntries(from: string, to: string) {
  return useQuery({
    queryFn: ({ signal }) =>
      apiRequest(`/api/v1/habit-entries?from=${from}&to=${to}`, {
        method: 'GET',
        schema: habitEntriesSchema,
        signal,
      }),
    queryKey: habitKeys.entries({ from, to }),
  });
}

export function useToggleHabit() {
  const queryClient = useQueryClient();

  return useMutation<HabitEntry, Error, ToggleHabitVariables, MutationContext>({
    mutationFn: ({ habitId, date, completed, value }) =>
      apiRequest(`/api/v1/habits/${habitId}/entries`, {
        body: {
          completed,
          ...(value === undefined ? {} : { value }),
          date,
        },
        method: 'POST',
        schema: habitEntrySchema,
      }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: habitEntriesKeyPrefix });

      const previousEntries = snapshotHabitEntryQueries(queryClient);
      const optimisticEntry: HabitEntry = {
        id: variables.entryId ?? `optimistic-${variables.habitId}-${variables.date}`,
        habitId: variables.habitId,
        userId: 'optimistic',
        date: variables.date,
        completed: variables.completed,
        value: variables.value ?? null,
        createdAt: Date.now(),
      };

      applyHabitEntryToCache(queryClient, optimisticEntry);

      return {
        optimisticEntry,
        previousEntries,
      };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      restoreHabitEntryQueries(queryClient, context.previousEntries);
    },
    onSuccess: (entry) => {
      applyHabitEntryToCache(queryClient, entry);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: habitEntriesKeyPrefix });
    },
  });
}

export function useUpdateHabitEntry() {
  const queryClient = useQueryClient();

  return useMutation<HabitEntry, Error, UpdateHabitEntryVariables, MutationContext>({
    mutationFn: ({ id, completed, value }) =>
      apiRequest(`/api/v1/habit-entries/${id}`, {
        body: {
          ...(completed === undefined ? {} : { completed }),
          ...(value === undefined ? {} : { value }),
        },
        method: 'PATCH',
        schema: habitEntrySchema,
      }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: habitEntriesKeyPrefix });

      const previousEntries = snapshotHabitEntryQueries(queryClient);
      const existingEntry = findCachedHabitEntry(queryClient, variables.id);
      const optimisticEntry: HabitEntry = {
        id: variables.id,
        habitId: variables.habitId,
        userId: existingEntry?.userId ?? 'optimistic',
        date: variables.date,
        completed: variables.completed ?? existingEntry?.completed ?? false,
        value: variables.value ?? existingEntry?.value ?? null,
        createdAt: existingEntry?.createdAt ?? Date.now(),
      };

      applyHabitEntryToCache(queryClient, optimisticEntry);

      return {
        optimisticEntry,
        previousEntries,
      };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      restoreHabitEntryQueries(queryClient, context.previousEntries);
    },
    onSuccess: (entry) => {
      applyHabitEntryToCache(queryClient, entry);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: habitEntriesKeyPrefix });
    },
  });
}
