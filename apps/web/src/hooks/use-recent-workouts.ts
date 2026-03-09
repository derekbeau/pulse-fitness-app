import { useQuery } from '@tanstack/react-query';
import {
  type WorkoutSession,
  type WorkoutSessionListItem,
  workoutSessionListItemSchema,
  workoutSessionSchema,
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

const fetchRecentWorkoutDetails = async (sessionId: string, signal?: AbortSignal) => {
  const workoutSession = await apiRequest<WorkoutSession>(
    `/api/v1/workout-sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'GET',
      signal,
    },
  );

  return workoutSessionSchema.parse(workoutSession);
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

  const details = await Promise.all(
    parsedSessions.map((session) => fetchRecentWorkoutDetails(session.id, signal)),
  );

  const detailsById = new Map(details.map((detail) => [detail.id, detail]));

  return parsedSessions.map<RecentWorkout>((session) => {
    const detail = detailsById.get(session.id);
    const exerciseCount = detail
      ? new Set(detail.sets.map((set) => set.exerciseId)).size
      : 0;

    return {
      id: session.id,
      name: session.name,
      date: session.date,
      duration: session.duration,
      exerciseCount,
    };
  });
};

export const useRecentWorkouts = (limit = DEFAULT_WORKOUT_LIMIT) => {
  const normalizedLimit = Math.max(1, Math.floor(limit));

  return useQuery({
    queryFn: ({ signal }) => fetchRecentWorkouts(normalizedLimit, signal),
    queryKey: recentWorkoutsKeys.list(normalizedLimit),
  });
};
