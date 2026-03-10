import { useQuery } from '@tanstack/react-query';
import {
  type WorkoutSessionListItem,
  workoutSessionListItemSchema,
} from '@pulse/shared';
import { z } from 'zod';

import { apiRequest } from '@/lib/api-client';

const DEFAULT_WORKOUT_LIMIT = 5;

const workoutSessionListSchema = z.array(workoutSessionListItemSchema);

export type RecentWorkout = Pick<WorkoutSessionListItem, 'id' | 'name' | 'date' | 'duration'> & {
  exerciseCount: number;
};

export const recentWorkoutsKeys = {
  all: ['dashboard', 'recent-workouts'] as const,
  list: (limit: number) => [...recentWorkoutsKeys.all, limit] as const,
};

const fetchRecentWorkouts = async (limit = DEFAULT_WORKOUT_LIMIT, signal?: AbortSignal) => {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const sessions = await apiRequest<WorkoutSessionListItem[]>(
    `/api/v1/workout-sessions?status=completed&limit=${encodeURIComponent(String(normalizedLimit))}`,
    {
      method: 'GET',
      signal,
    },
  );

  const parsedSessions = workoutSessionListSchema.parse(sessions).slice(0, normalizedLimit);

  return parsedSessions.map<RecentWorkout>((session) => ({
    id: session.id,
    name: session.name,
    date: session.date,
    duration: session.duration,
    exerciseCount: session.exerciseCount,
  }));
};

export const useRecentWorkouts = (limit = DEFAULT_WORKOUT_LIMIT) => {
  const normalizedLimit = Math.max(1, Math.floor(limit));

  return useQuery({
    queryFn: ({ signal }) => fetchRecentWorkouts(normalizedLimit, signal),
    queryKey: recentWorkoutsKeys.list(normalizedLimit),
  });
};
