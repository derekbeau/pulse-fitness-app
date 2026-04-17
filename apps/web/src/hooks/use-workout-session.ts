import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkoutSessionInputSchema,
  reorderWorkoutSessionExercisesInputSchema,
  type ReorderWorkoutSessionExercisesInput,
  type WorkoutTemplateSectionType,
  type WorkoutSessionTimeSegment,
  type WorkoutSession,
  updateWorkoutSessionTimeSegmentsInputSchema,
  updateWorkoutSessionInputSchema,
  workoutSessionSchema,
} from '@pulse/shared';
import { toast } from 'sonner';
import { z } from 'zod';

import { setStoredActiveWorkoutSessionId } from '@/features/workouts/lib/session-persistence';
import {
  workoutQueryKeys,
} from '@/features/workouts/api/workouts';
import {
  syncSessionMutationCache,
  workoutSessionQueryKeys,
} from '@/features/workouts/lib/session-query-cache';
import { apiRequest } from '@/lib/api-client';
import { crossFeatureInvalidationMap, invalidateQueryKeys } from '@/lib/query-invalidation';

const workoutSessionResponseSchema = z.object({
  data: workoutSessionSchema,
}) as unknown as z.ZodType<{ data: WorkoutSession }>;

export { workoutSessionQueryKeys };

type CreateWorkoutSessionRequest = z.input<typeof createWorkoutSessionInputSchema>;
type UpdateSessionStartTimeRequest = {
  startedAt: number;
};
type UpdateSessionStatusRequest = {
  status: 'in-progress' | 'paused' | 'cancelled';
  activeSection?: WorkoutTemplateSectionType;
};
type UpdateSessionTimeSegmentsRequest = {
  timeSegments: WorkoutSessionTimeSegment[];
};
type ReorderSessionExercisesRequest = ReorderWorkoutSessionExercisesInput;
type DeleteSessionResult = {
  success: boolean;
};

async function getWorkoutSession(sessionId: string) {
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}`);
  const payload = workoutSessionResponseSchema.parse({ data });

  return payload.data;
}

async function startSession(input: CreateWorkoutSessionRequest) {
  const parsedInput = createWorkoutSessionInputSchema.parse(input);
  const data = await apiRequest<unknown>('/api/v1/workout-sessions', {
    body: JSON.stringify(parsedInput),
    method: 'POST',
  });
  const payload = workoutSessionResponseSchema.parse({ data });

  return payload.data;
}

async function updateSessionStartTime(sessionId: string, input: UpdateSessionStartTimeRequest) {
  const parsedInput = updateWorkoutSessionInputSchema.parse({
    startedAt: input.startedAt,
  });
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}`, {
    body: JSON.stringify(parsedInput),
    method: 'PATCH',
  });
  const payload = workoutSessionResponseSchema.parse({ data });

  return payload.data;
}

async function updateSessionStatus(sessionId: string, input: UpdateSessionStatusRequest) {
  const parsedInput = updateWorkoutSessionInputSchema.parse({
    activeSection: input.activeSection,
    status: input.status,
  });
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}`, {
    body: JSON.stringify(parsedInput),
    method: 'PATCH',
  });
  const payload = workoutSessionResponseSchema.parse({ data });

  return payload.data;
}

async function updateSessionTimeSegments(
  sessionId: string,
  input: UpdateSessionTimeSegmentsRequest,
) {
  const parsedInput = updateWorkoutSessionTimeSegmentsInputSchema.parse({
    timeSegments: input.timeSegments,
  });
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}/time-segments`, {
    body: JSON.stringify(parsedInput),
    method: 'PATCH',
  });
  const payload = workoutSessionResponseSchema.parse({ data });

  return payload.data;
}

async function reorderSessionExercises(sessionId: string, input: ReorderSessionExercisesRequest) {
  const parsedInput = reorderWorkoutSessionExercisesInputSchema.parse(input);
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}/reorder`, {
    body: JSON.stringify(parsedInput),
    method: 'PATCH',
  });
  const payload = workoutSessionResponseSchema.parse({ data });

  return payload.data;
}

type CancelSessionResult = {
  revertedToSchedule: boolean;
};

async function cancelSession(sessionId: string) {
  return await apiRequest<CancelSessionResult>(`/api/v1/workout-sessions/${sessionId}/cancel`, {
    method: 'POST',
  });
}

async function deleteSession(sessionId: string) {
  return await apiRequest<DeleteSessionResult>(`/api/v1/workout-sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

function getSessionStatusSuccessMessage(status: WorkoutSession['status']) {
  if (status === 'paused') {
    return 'Workout paused';
  }

  if (status === 'cancelled') {
    return 'Workout cancelled';
  }

  if (status === 'in-progress') {
    return 'Workout resumed';
  }

  return 'Workout status updated';
}

type UseWorkoutSessionOptions = {
  refetchInterval?: number | false;
};

export function useWorkoutSession(
  sessionId: string | null | undefined,
  options?: UseWorkoutSessionOptions,
) {
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useQuery<WorkoutSession>({
    enabled: normalizedSessionId.length > 0,
    refetchInterval: options?.refetchInterval,
    refetchIntervalInBackground: options?.refetchInterval !== undefined,
    queryFn: () => getWorkoutSession(normalizedSessionId),
    queryKey: workoutSessionQueryKeys.detail(normalizedSessionId),
  });
}

export function useStartSession() {
  const queryClient = useQueryClient();

  return useMutation<WorkoutSession, Error, CreateWorkoutSessionRequest>({
    mutationFn: startSession,
    onSuccess: async (session) => {
      setStoredActiveWorkoutSessionId(session.id);
      queryClient.setQueryData(workoutSessionQueryKeys.detail(session.id), session);
      queryClient.setQueryData(workoutQueryKeys.session(session.id), session);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutSessionQueryKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: workoutSessionQueryKeys.detail(session.id),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.sessions(),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.session(session.id),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.scheduledWorkoutListRoot(),
        }),
        invalidateQueryKeys(
          queryClient,
          crossFeatureInvalidationMap.activeWorkoutSessionMutation(),
        ),
      ]);
      toast.success('Workout started');
    },
  });
}

export function useUpdateSessionStartTime(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<WorkoutSession, Error, UpdateSessionStartTimeRequest>({
    mutationFn: async (input) => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to update session start time');
      }

      return updateSessionStartTime(normalizedSessionId, input);
    },
    onSuccess: async (session) => {
      await syncSessionMutationCache(queryClient, session, { invalidateDashboard: true });
      toast.success('Workout start time updated');
    },
  });
}

export function useUpdateSessionStatus(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<WorkoutSession, Error, UpdateSessionStatusRequest>({
    mutationFn: async (input) => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to update workout status');
      }

      return updateSessionStatus(normalizedSessionId, input);
    },
    onSuccess: async (session) => {
      await syncSessionMutationCache(queryClient, session, { invalidateDashboard: true });
      toast.success(getSessionStatusSuccessMessage(session.status));
    },
  });
}

export function useUpdateSessionTimeSegments(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<WorkoutSession, Error, UpdateSessionTimeSegmentsRequest>({
    mutationFn: async (input) => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to update workout time segments');
      }

      return updateSessionTimeSegments(normalizedSessionId, input);
    },
    onSuccess: async (session) => {
      await syncSessionMutationCache(queryClient, session, { invalidateDashboard: true });
      toast.success('Workout timing updated');
    },
  });
}

export function useReorderSessionExercises(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<WorkoutSession, Error, ReorderSessionExercisesRequest>({
    mutationFn: async (input) => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to reorder exercises');
      }

      return reorderSessionExercises(normalizedSessionId, input);
    },
    onSuccess: async (session) => {
      await syncSessionMutationCache(queryClient, session);
      toast.success('Workout exercise order updated');
    },
  });
}

export function useCancelAndRevertSession(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<CancelSessionResult, Error>({
    mutationFn: async () => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to cancel workout session');
      }

      return cancelSession(normalizedSessionId);
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutSessionQueryKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: workoutSessionQueryKeys.detail(normalizedSessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.sessions(),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.session(normalizedSessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.scheduledWorkoutListRoot(),
        }),
        invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.workoutSessionChange()),
      ]);
      toast.success(
        result.revertedToSchedule
          ? 'Workout cancelled and returned to schedule'
          : 'Workout cancelled',
      );
    },
  });
}

export function useDeleteSession(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  const normalizedSessionId = sessionId?.trim() ?? '';

  return useMutation<DeleteSessionResult, Error>({
    mutationFn: async () => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to delete workout session');
      }

      return deleteSession(normalizedSessionId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutSessionQueryKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: workoutSessionQueryKeys.detail(normalizedSessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.sessions(),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.session(normalizedSessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.scheduledWorkoutListRoot(),
        }),
        invalidateQueryKeys(queryClient, crossFeatureInvalidationMap.workoutSessionChange()),
      ]);
      toast.success('Workout deleted');
    },
  });
}
