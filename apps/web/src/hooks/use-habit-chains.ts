import { useQuery } from '@tanstack/react-query';
import { habitEntrySchema, type HabitEntry } from '@pulse/shared';
import { z } from 'zod';

import { apiRequest } from '@/lib/api-client';

const habitEntriesSchema = z.array(habitEntrySchema);

export const habitChainKeys = {
  all: ['habits', 'chains'] as const,
  range: (from: string, to: string) => [...habitChainKeys.all, from, to] as const,
};

const fetchHabitChains = async (
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<HabitEntry[]> => {
  const entries = await apiRequest<HabitEntry[]>(
    `/api/v1/habit-entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    {
      method: 'GET',
      signal,
    },
  );

  return habitEntriesSchema.parse(entries);
};

export const useHabitChains = (from: string, to: string) =>
  useQuery({
    enabled: from.length > 0 && to.length > 0,
    queryFn: ({ signal }) => fetchHabitChains(from, to, signal),
    queryKey: habitChainKeys.range(from, to),
  });
