import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  createHabitInputSchema,
  habitEntrySchema,
  habitSchema,
  reorderHabitsInputSchema,
  updateHabitInputSchema,
  type CreateHabitInput,
  type Habit,
  type HabitEntry,
  type ReorderHabitsInput,
  type UpdateHabitInput,
} from '@pulse/shared';
import { toast } from 'sonner';
import { z } from 'zod';

import { habitChainQueryKeys } from '@/hooks/use-habit-chains';
import { crossFeatureInvalidationMap } from '@/lib/query-invalidation';
import { apiRequest } from '@/lib/api-client';
import { createOptimisticMutation } from '@/lib/optimistic';

import { habitQueryKeys } from './keys';

const resolvedTodayEntrySchema = z.object({
  completed: z.boolean(),
  value: z.number().nullable(),
  isOverride: z.boolean(),
});
const habitWithTodayEntrySchema = habitSchema.extend({
  todayEntry: resolvedTodayEntrySchema.nullable().optional(),
});
const habitsWithTodayEntrySchema = z.array(habitWithTodayEntrySchema);
const habitEntriesSchema = z.array(habitEntrySchema);
const habitEntriesQueryKey = habitQueryKeys.entries();
const successSchema = z.object({
  success: z.literal(true),
});

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
  isOverride?: boolean;
};

type UpdateHabitEntryVariables = {
  id: string;
  habitId: string;
  date: string;
  completed?: boolean;
  value?: number;
  isOverride?: boolean;
};

type ReorderMutationContext = {
  previousHabits: Habit[] | undefined;
};

const compareHabitEntries = (left: HabitEntry, right: HabitEntry) =>
  left.date.localeCompare(right.date) ||
  left.createdAt - right.createdAt ||
  left.id.localeCompare(right.id);

const compareHabits = (left: Habit, right: Habit) =>
  left.sortOrder - right.sortOrder ||
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

const isHabitChainRangeQueryKey = (queryKey: QueryKey) =>
  queryKey[0] === 'habits' &&
  queryKey[1] === 'chains' &&
  typeof queryKey[2] === 'string' &&
  typeof queryKey[3] === 'string';

const getRangeFromQueryKey = (queryKey: QueryKey) => {
  const habitEntryParams = getEntriesParamsFromQueryKey(queryKey);
  if (habitEntryParams) {
    return habitEntryParams;
  }

  if (isHabitChainRangeQueryKey(queryKey)) {
    return {
      from: queryKey[2] as string,
      to: queryKey[3] as string,
    };
  }

  return null;
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
  entries: HabitEntry[] | undefined,
  nextEntry: HabitEntry,
  queryKey: QueryKey,
) => {
  const range = getRangeFromQueryKey(queryKey);
  if (!range || nextEntry.date < range.from || nextEntry.date > range.to) {
    return entries;
  }

  return upsertHabitEntry(entries, nextEntry);
};

const findCachedHabitEntry = (
  queryClient: ReturnType<typeof useQueryClient>,
  entryId: string,
): HabitEntry | undefined => {
  const snapshots = [
    ...queryClient.getQueriesData<HabitEntry[]>({
      queryKey: habitEntriesQueryKey,
    }),
    ...queryClient.getQueriesData<HabitEntry[]>({
      queryKey: habitChainQueryKeys.all,
    }),
  ];

  for (const [, entries] of snapshots) {
    const match = entries?.find((entry) => entry.id === entryId);
    if (match) {
      return match;
    }
  }

  return undefined;
};

const upsertHabit = (habits: Habit[] | undefined, nextHabit: Habit) => {
  const currentHabits = habits ?? [];
  const existingIndex = currentHabits.findIndex((habit) => habit.id === nextHabit.id);

  if (existingIndex === -1) {
    return [...currentHabits, nextHabit].sort(compareHabits);
  }

  const nextHabits = [...currentHabits];
  nextHabits[existingIndex] = nextHabit;

  return nextHabits.sort(compareHabits);
};

const reorderCachedHabits = (habits: Habit[] | undefined, items: ReorderHabitsInput['items']) => {
  if (!habits) {
    return habits;
  }

  const nextOrderById = new Map(items.map((item) => [item.id, item.sortOrder]));

  return habits
    .map((habit) => ({
      ...habit,
      sortOrder: nextOrderById.get(habit.id) ?? habit.sortOrder,
    }))
    .sort(compareHabits);
};

export function useHabits() {
  return useQuery({
    queryFn: async ({ signal }) => {
      const habits = await apiRequest<Habit[]>('/api/v1/habits', {
        method: 'GET',
        signal,
      });

      return habitsWithTodayEntrySchema.parse(habits).filter((habit) => habit.active);
    },
    queryKey: habitQueryKeys.habits(),
  });
}

export function useHabitEntries(from: string, to: string) {
  return useQuery({
    queryFn: async ({ signal }) => {
      const entries = await apiRequest<HabitEntry[]>(
        `/api/v1/habit-entries?from=${from}&to=${to}`,
        {
          method: 'GET',
          signal,
        },
      );

      return habitEntriesSchema.parse(entries);
    },
    queryKey: habitQueryKeys.entries({ from, to }),
  });
}

export function useCreateHabit() {
  const queryClient = useQueryClient();

  return useMutation<Habit, Error, CreateHabitInput>({
    mutationFn: async (values) => {
      const payload = createHabitInputSchema.parse(values);
      const habit = await apiRequest<Habit>('/api/v1/habits', {
        body: payload,
        method: 'POST',
      });

      return habitSchema.parse(habit);
    },
    onSuccess: (habit) => {
      queryClient.setQueryData<Habit[]>(habitQueryKeys.habits(), (currentHabits) =>
        upsertHabit(currentHabits, habit),
      );
      toast.success('Habit created');
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: habitQueryKeys.habits() });
    },
  });
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();

  return useMutation<Habit, Error, { id: string; values: UpdateHabitInput }>({
    mutationFn: async ({ id, values }) => {
      const payload = updateHabitInputSchema.parse(values);
      const habit = await apiRequest<Habit>(`/api/v1/habits/${id}`, {
        body: payload,
        method: 'PUT',
      });

      return habitSchema.parse(habit);
    },
    onSuccess: (habit) => {
      queryClient.setQueryData<Habit[]>(habitQueryKeys.habits(), (currentHabits) => {
        if (!habit.active) {
          return currentHabits?.filter((item) => item.id !== habit.id);
        }

        return upsertHabit(currentHabits, habit);
      });
      toast.success('Habit updated');
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: habitQueryKeys.habits() });
    },
  });
}

export function useDeleteHabit() {
  const queryClient = useQueryClient();

  return useMutation<{ success: true }, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const response = await apiRequest<{ success: true }>(`/api/v1/habits/${id}`, {
        method: 'DELETE',
      });

      return successSchema.parse(response);
    },
    onSuccess: (_response, variables) => {
      queryClient.setQueryData<Habit[]>(habitQueryKeys.habits(), (currentHabits) =>
        currentHabits?.filter((habit) => habit.id !== variables.id),
      );
      toast.success('Habit deleted');
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: habitQueryKeys.habits() });
    },
  });
}

export function useReorderHabits() {
  const queryClient = useQueryClient();

  return useMutation<{ success: true }, Error, ReorderHabitsInput['items'], ReorderMutationContext>(
    {
      mutationFn: (items) => {
        const payload = reorderHabitsInputSchema.parse({ items });

        return apiRequest<{ success: true }>('/api/v1/habits/reorder', {
          body: payload,
          method: 'PATCH',
        }).then((response) => successSchema.parse(response));
      },
      onMutate: async (items) => {
        await queryClient.cancelQueries({ queryKey: habitQueryKeys.habits() });

        const previousHabits = queryClient.getQueryData<Habit[]>(habitQueryKeys.habits());
        queryClient.setQueryData<Habit[]>(habitQueryKeys.habits(), (currentHabits) =>
          reorderCachedHabits(currentHabits, items),
        );

        return { previousHabits };
      },
      onError: (_error, _variables, context) => {
        if (!context) {
          return;
        }

        queryClient.setQueryData(habitQueryKeys.habits(), context.previousHabits);
        queryClient.setQueryData(habitQueryKeys.habits(), context.previousHabits);
      },
      onSuccess: () => {
        toast.success('Habit order updated');
      },
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: habitQueryKeys.habits() });
      },
    },
  );
}

export function useToggleHabit() {
  return createOptimisticMutation<HabitEntry[], HabitEntry, ToggleHabitVariables, { optimisticEntry: HabitEntry }>({
    mutationFn: async ({ habitId, date, completed, value, isOverride }) => {
      const entry = await apiRequest<HabitEntry>(`/api/v1/habits/${habitId}/entries`, {
        body: {
          completed,
          ...(value === undefined ? {} : { value }),
          ...(isOverride === undefined ? {} : { isOverride }),
          date,
        },
        method: 'POST',
      });

      return habitEntrySchema.parse(entry);
    },
    getMeta: (variables) => ({
      optimisticEntry: {
        id: variables.entryId ?? `optimistic-${variables.habitId}-${variables.date}`,
        habitId: variables.habitId,
        userId: 'optimistic',
        date: variables.date,
        completed: variables.completed,
        value: variables.value ?? null,
        isOverride: variables.isOverride ?? false,
        createdAt: Date.now(),
      },
    }),
    invalidateKeys: () => [
      habitEntriesQueryKey,
      habitQueryKeys.list(),
      ...crossFeatureInvalidationMap.habitEntryMutation(),
    ],
    queryKey: () => [habitEntriesQueryKey, habitChainQueryKeys.all],
    reconcile: (current, entry, _variables, context) =>
      applyHabitEntryToCache(current, entry, context.queryKey),
    updater: (current, _variables, context) =>
      applyHabitEntryToCache(current, context.meta.optimisticEntry, context.queryKey),
  });
}

export function useUpdateHabitEntry() {
  return createOptimisticMutation<
    HabitEntry[],
    HabitEntry,
    UpdateHabitEntryVariables,
    { optimisticEntry: HabitEntry }
  >({
    mutationFn: async ({ id, completed, value, isOverride }) => {
      const entry = await apiRequest<HabitEntry>(`/api/v1/habit-entries/${id}`, {
        body: {
          ...(completed === undefined ? {} : { completed }),
          ...(value === undefined ? {} : { value }),
          ...(isOverride === undefined ? {} : { isOverride }),
        },
        method: 'PATCH',
      });

      return habitEntrySchema.parse(entry);
    },
    getMeta: (variables, queryClient) => {
      const existingEntry = findCachedHabitEntry(queryClient, variables.id);
      return {
        optimisticEntry: {
        id: variables.id,
        habitId: variables.habitId,
        userId: existingEntry?.userId ?? 'optimistic',
        date: variables.date,
        completed: variables.completed ?? existingEntry?.completed ?? false,
        value: variables.value ?? existingEntry?.value ?? null,
        isOverride: variables.isOverride ?? existingEntry?.isOverride ?? false,
        createdAt: existingEntry?.createdAt ?? Date.now(),
        },
      };
    },
    invalidateKeys: () => [
      habitEntriesQueryKey,
      habitQueryKeys.list(),
      ...crossFeatureInvalidationMap.habitEntryMutation(),
    ],
    queryKey: () => [habitEntriesQueryKey, habitChainQueryKeys.all],
    reconcile: (current, entry, _variables, context) =>
      applyHabitEntryToCache(current, entry, context.queryKey),
    updater: (current, _variables, context) =>
      applyHabitEntryToCache(current, context.meta.optimisticEntry, context.queryKey),
  });
}
