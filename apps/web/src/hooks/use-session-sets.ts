import {
  createSetSchema,
  sessionSetSchema,
  type SessionSet,
  type WorkoutSession,
  updateSetSchema,
} from '@pulse/shared';
import { toast } from 'sonner';
import { z } from 'zod';

import { workoutQueryKeys } from '@/features/workouts/api/workouts';
import { apiRequest } from '@/lib/api-client';
import { createOptimisticMutation } from '@/lib/optimistic';
import { crossFeatureInvalidationMap } from '@/lib/query-invalidation';

import { workoutSessionQueryKeys } from './use-workout-session';

const sessionSetResponseSchema = z.object({
  data: sessionSetSchema,
}) as unknown as z.ZodType<{ data: SessionSet }>;

type CreateSetRequest = z.input<typeof createSetSchema>;
type UpdateSetRequest = z.input<typeof updateSetSchema>;

type UpdateSetVariables = {
  setId: string;
  update: UpdateSetRequest;
};

async function createSessionSet(sessionId: string, input: CreateSetRequest) {
  const parsedInput = createSetSchema.parse(input);
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}/sets`, {
    body: JSON.stringify(parsedInput),
    method: 'POST',
  });
  const payload = sessionSetResponseSchema.parse({ data });

  return payload.data;
}

async function patchSessionSet(sessionId: string, setId: string, input: UpdateSetRequest) {
  const parsedInput = updateSetSchema.parse(input);
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}/sets/${setId}`, {
    body: JSON.stringify(parsedInput),
    method: 'PATCH',
  });
  const payload = sessionSetResponseSchema.parse({ data });

  return payload.data;
}

const compareSessionSets = (left: SessionSet, right: SessionSet) =>
  (left.exerciseId ?? '').localeCompare(right.exerciseId ?? '') ||
  left.setNumber - right.setNumber ||
  left.createdAt - right.createdAt ||
  left.id.localeCompare(right.id);

const upsertSessionSet = (sets: SessionSet[], nextSet: SessionSet) => {
  const existingIndex = sets.findIndex(
    (set) =>
      set.id === nextSet.id ||
      (set.exerciseId === nextSet.exerciseId && set.setNumber === nextSet.setNumber),
  );

  if (existingIndex === -1) {
    return [...sets, nextSet].sort(compareSessionSets);
  }

  const nextSets = [...sets];
  nextSets[existingIndex] = nextSet;

  return nextSets.sort(compareSessionSets);
};

const replaceSessionSet = (
  sets: SessionSet[],
  setId: string,
  updater: (current: SessionSet) => SessionSet,
) => {
  const existingIndex = sets.findIndex((set) => set.id === setId);

  if (existingIndex === -1) {
    return sets;
  }

  const nextSets = [...sets];
  nextSets[existingIndex] = updater(nextSets[existingIndex] as SessionSet);

  return nextSets.sort(compareSessionSets);
};

const applySessionSet = (session: WorkoutSession | undefined, nextSet: SessionSet) => {
  if (!session) {
    return session;
  }

  return {
    ...session,
    exercises: session.exercises?.map((exercise) =>
      exercise.exerciseId === nextSet.exerciseId
        ? {
            ...exercise,
            sets: upsertSessionSet(exercise.sets, nextSet),
          }
        : exercise,
    ),
    sets: upsertSessionSet(session.sets, nextSet),
  };
};

const updateSessionSet = (
  session: WorkoutSession | undefined,
  setId: string,
  updater: (current: SessionSet) => SessionSet,
) => {
  if (!session) {
    return session;
  }

  return {
    ...session,
    exercises: session.exercises?.map((exercise) => ({
      ...exercise,
      sets: replaceSessionSet(exercise.sets, setId, updater),
    })),
    sets: replaceSessionSet(session.sets, setId, updater),
  };
};

const getSessionCacheKeys = (sessionId: string) => {
  if (!sessionId) {
    return [];
  }

  return [workoutSessionQueryKeys.detail(sessionId), workoutQueryKeys.session(sessionId)] as const;
};

const getSessionInvalidateKeys = (sessionId: string) => {
  if (!sessionId) {
    return [];
  }

  return [
    workoutSessionQueryKeys.all,
    workoutSessionQueryKeys.detail(sessionId),
    workoutQueryKeys.sessions(),
    workoutQueryKeys.session(sessionId),
    ...crossFeatureInvalidationMap.workoutSessionChange(),
  ] as const;
};

export function useLogSet(sessionId: string | null | undefined) {
  const normalizedSessionId = sessionId?.trim() ?? '';

  return createOptimisticMutation<
    WorkoutSession,
    SessionSet,
    CreateSetRequest,
    { optimisticSet: SessionSet }
  >({
    mutationFn: async (input) => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to log sets');
      }

      return createSessionSet(normalizedSessionId, input);
    },
    getMeta: (variables) => ({
      optimisticSet: {
        id: `optimistic-${normalizedSessionId}-${variables.exerciseId}-${variables.setNumber}`,
        exerciseId: variables.exerciseId,
        setNumber: variables.setNumber,
        weight: variables.weight ?? null,
        reps: variables.reps ?? null,
        targetWeight: undefined,
        targetWeightMin: undefined,
        targetWeightMax: undefined,
        targetSeconds: undefined,
        targetDistance: undefined,
        completed: false,
        skipped: false,
        section: variables.section ?? null,
        notes: null,
        createdAt: Date.now(),
      },
    }),
    invalidateKeys: () => getSessionInvalidateKeys(normalizedSessionId),
    onSuccess: async () => {
      toast.success('Set added', { duration: 1500 });
    },
    queryKey: () => getSessionCacheKeys(normalizedSessionId),
    reconcile: (current, serverSet) => applySessionSet(current, serverSet),
    updater: (current, _variables, context) => applySessionSet(current, context.meta.optimisticSet),
  });
}

export function useUpdateSet(sessionId: string | null | undefined) {
  const normalizedSessionId = sessionId?.trim() ?? '';

  return createOptimisticMutation<WorkoutSession, SessionSet, UpdateSetVariables>({
    mutationFn: async ({ setId, update }) => {
      if (!normalizedSessionId) {
        throw new Error('Session id is required to update sets');
      }

      return patchSessionSet(normalizedSessionId, setId, update);
    },
    invalidateKeys: () => getSessionInvalidateKeys(normalizedSessionId),
    onSuccess: async (_set, variables) => {
      if (variables.update.completed) {
        toast.success('Set saved', { duration: 1500 });
      }
    },
    queryKey: () => getSessionCacheKeys(normalizedSessionId),
    reconcile: (current, serverSet, variables) =>
      updateSessionSet(current, variables.setId, () => serverSet),
    updater: (current, variables) =>
      updateSessionSet(current, variables.setId, (existingSet) => {
        const nextSet: SessionSet = {
          ...existingSet,
          ...(variables.update.completed === undefined
            ? {}
            : { completed: variables.update.completed }),
          ...(variables.update.reps === undefined ? {} : { reps: variables.update.reps }),
          ...(variables.update.notes === undefined
            ? {}
            : { notes: (variables.update.notes ?? null) as string | null }),
          ...(variables.update.skipped === undefined ? {} : { skipped: variables.update.skipped }),
          ...(variables.update.weight === undefined ? {} : { weight: variables.update.weight }),
        };

        return nextSet;
      }),
  });
}
