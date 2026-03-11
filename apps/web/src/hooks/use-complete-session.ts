import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type SessionSetInput,
  type WorkoutSession,
  type WorkoutSessionListItem,
  type WorkoutSessionFeedback,
  updateWorkoutSessionInputSchema,
  workoutSessionSchema,
} from '@pulse/shared';
import { toast } from 'sonner';
import { z } from 'zod';

import { workoutQueryKeys } from '@/features/workouts/api/workouts';
import { clearStoredActiveWorkoutSessionId } from '@/features/workouts/lib/session-persistence';
import { apiRequest } from '@/lib/api-client';

import { workoutSessionQueryKeys } from './use-workout-session';

const workoutSessionResponseSchema = z.object({
  data: workoutSessionSchema,
}) as unknown as z.ZodType<{ data: WorkoutSession }>;

type CompleteSessionInput = {
  completedAt?: number;
  duration?: number | null;
  exerciseNotes?: Record<string, string>;
  feedback: WorkoutSessionFeedback;
  notes?: string | null;
  sets?: SessionSetInput[];
};

async function completeSession(sessionId: string, input: CompleteSessionInput) {
  const parsedBody = updateWorkoutSessionInputSchema.parse({
    completedAt: input.completedAt ?? Date.now(),
    duration: input.duration ?? null,
    feedback: input.feedback,
    exerciseNotes: input.exerciseNotes,
    notes: input.notes ?? null,
    sets: input.sets,
    status: 'completed',
  });

  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}`, {
    body: JSON.stringify(parsedBody),
    method: 'PUT',
  });
  const payload = workoutSessionResponseSchema.parse({ data });

  return payload.data;
}

function mergeSessionListItem(
  session: WorkoutSession,
  item?: WorkoutSessionListItem,
): WorkoutSessionListItem {
  return {
    id: session.id,
    name: session.name,
    date: session.date,
    status: session.status,
    templateId: session.templateId,
    templateName: item?.templateName ?? null,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    duration: session.duration,
    exerciseCount: item?.exerciseCount ?? session.sets.length,
    createdAt: item?.createdAt ?? session.createdAt,
  };
}

function countDistinctSessionExercises(session: WorkoutSession) {
  return new Set(session.sets.map((set) => set.exerciseId)).size;
}

function sortWorkoutSessionListItems(left: WorkoutSessionListItem, right: WorkoutSessionListItem) {
  return (
    right.date.localeCompare(left.date) ||
    right.startedAt - left.startedAt ||
    right.createdAt - left.createdAt
  );
}

function upsertWorkoutSessionList(
  current: WorkoutSessionListItem[] | undefined,
  nextItem: WorkoutSessionListItem,
) {
  const nextList = current ? [...current] : [];
  const existingIndex = nextList.findIndex((item) => item.id === nextItem.id);

  if (existingIndex === -1) {
    nextList.unshift(nextItem);
  } else {
    nextList[existingIndex] = nextItem;
  }

  return nextList.sort(sortWorkoutSessionListItems);
}

export function useCompleteSession(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<WorkoutSession, Error, CompleteSessionInput>({
    mutationFn: async (input) => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to complete a workout');
      }

      return completeSession(normalizedSessionId, input);
    },
    onSuccess: async (session) => {
      if (session.status === 'completed') {
        clearStoredActiveWorkoutSessionId();
      }

      const fallbackItem: WorkoutSessionListItem = {
        completedAt: session.completedAt,
        createdAt: session.createdAt,
        date: session.date,
        duration: session.duration,
        exerciseCount: countDistinctSessionExercises(session),
        id: session.id,
        name: session.name,
        startedAt: session.startedAt,
        status: session.status,
        templateId: session.templateId,
        templateName: null,
      };

      queryClient.setQueryData(workoutSessionQueryKeys.detail(session.id), session);
      queryClient.setQueryData(workoutQueryKeys.session(session.id), session);
      queryClient.setQueriesData<WorkoutSessionListItem[]>(
        {
          queryKey: workoutQueryKeys.sessions(),
        },
        (current) => {
          const existing = current?.find((item) => item.id === session.id);
          const nextItem = mergeSessionListItem(session, existing ?? fallbackItem);

          return upsertWorkoutSessionList(current, nextItem);
        },
      );
      queryClient.setQueryData<WorkoutSessionListItem[]>(
        workoutQueryKeys.sessionsList({}),
        (current) => {
          const existing = current?.find((item) => item.id === session.id);
          const nextItem = mergeSessionListItem(session, existing ?? fallbackItem);

          return upsertWorkoutSessionList(current, nextItem);
        },
      );
      queryClient.setQueryData<WorkoutSessionListItem[]>(
        workoutQueryKeys.completedSessions(),
        (current) => {
          const existing = current?.find((item) => item.id === session.id);
          const nextItem = mergeSessionListItem(session, existing ?? fallbackItem);

          return upsertWorkoutSessionList(current, nextItem);
        },
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workoutQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: workoutSessionQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: workoutSessionQueryKeys.detail(session.id) }),
      ]);
      toast.success('Workout completed');
    },
  });
}

export type { CompleteSessionInput };
