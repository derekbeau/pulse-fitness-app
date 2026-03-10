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

import { apiRequest } from '@/lib/api-client';

import { habitKeys } from './keys';

const habitsSchema = z.array(habitSchema);
const habitEntriesSchema = z.array(habitEntrySchema);
const habitEntriesKeyPrefix = [...habitKeys.all, 'entries'] as const;
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

      return habitsSchema.parse(habits);
    },
    queryKey: habitKeys.list(),
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
    queryKey: habitKeys.entries({ from, to }),
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
      queryClient.setQueryData<Habit[]>(habitKeys.list(), (currentHabits) =>
        upsertHabit(currentHabits, habit),
      );
      toast.success('Habit created');
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: habitKeys.list() });
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
      queryClient.setQueryData<Habit[]>(habitKeys.list(), (currentHabits) =>
        upsertHabit(currentHabits, habit),
      );
      toast.success('Habit updated');
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: habitKeys.list() });
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
      queryClient.setQueryData<Habit[]>(habitKeys.list(), (currentHabits) =>
        currentHabits?.filter((habit) => habit.id !== variables.id),
      );
      toast.success('Habit deleted');
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: habitKeys.list() });
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
        await queryClient.cancelQueries({ queryKey: habitKeys.list() });

        const previousHabits = queryClient.getQueryData<Habit[]>(habitKeys.list());
        queryClient.setQueryData<Habit[]>(habitKeys.list(), (currentHabits) =>
          reorderCachedHabits(currentHabits, items),
        );

        return { previousHabits };
      },
      onError: (_error, _variables, context) => {
        if (!context) {
          return;
        }

        queryClient.setQueryData(habitKeys.list(), context.previousHabits);
      },
      onSuccess: () => {
        toast.success('Habit order updated');
      },
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: habitKeys.list() });
      },
    },
  );
}

export function useToggleHabit() {
  const queryClient = useQueryClient();

  return useMutation<HabitEntry, Error, ToggleHabitVariables, MutationContext>({
    mutationFn: async ({ habitId, date, completed, value }) => {
      const entry = await apiRequest<HabitEntry>(`/api/v1/habits/${habitId}/entries`, {
        body: {
          completed,
          ...(value === undefined ? {} : { value }),
          date,
        },
        method: 'POST',
      });

      return habitEntrySchema.parse(entry);
    },
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
    mutationFn: async ({ id, completed, value }) => {
      const entry = await apiRequest<HabitEntry>(`/api/v1/habit-entries/${id}`, {
        body: {
          ...(completed === undefined ? {} : { completed }),
          ...(value === undefined ? {} : { value }),
        },
        method: 'PATCH',
      });

      return habitEntrySchema.parse(entry);
    },
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
