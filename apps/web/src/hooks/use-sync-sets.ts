import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { batchUpsertSetsSchema, sessionSetSchema, type SessionSet } from '@pulse/shared';
import { z } from 'zod';

import { ApiError, apiRequest } from '@/lib/api-client';

import { workoutSessionQueryKeys } from './use-workout-session';

const sessionSetGroupSchema = z.object({
  exerciseId: z.string(),
  sets: z.array(sessionSetSchema),
});

const sessionSetGroupResponseSchema = z.object({
  data: z.array(sessionSetGroupSchema),
}) as unknown as z.ZodType<{
  data: Array<{ exerciseId: string; sets: SessionSet[] }>;
}>;

type SyncableSetInput = z.input<typeof batchUpsertSetsSchema>['sets'][number];

type SyncPayload = {
  keepalive?: boolean;
  sets: SyncableSetInput[];
};

type UseSyncSetsOptions = {
  sessionId: string | null | undefined;
  syncIntervalMs?: number;
  syncOnChangeDebounceMs?: number;
  onSessionInactive?: () => void;
  onSyncError?: (error: Error) => void;
};

async function batchUpsertSessionSets(
  sessionId: string,
  input: SyncPayload,
): Promise<Array<{ exerciseId: string; sets: SessionSet[] }>> {
  const parsedInput = batchUpsertSetsSchema.parse({ sets: input.sets });
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}/sets`, {
    body: JSON.stringify(parsedInput),
    keepalive: input.keepalive,
    method: 'PUT',
  });
  const payload = sessionSetGroupResponseSchema.parse({ data });

  return payload.data;
}

function getSetKey(set: SyncableSetInput) {
  return set.id?.trim() ? `id:${set.id}` : `exercise:${set.exerciseId}:set:${set.setNumber}`;
}

export function useSyncSets(options: UseSyncSetsOptions) {
  const queryClient = useQueryClient();
  const normalizedSessionId = options.sessionId?.trim() ?? '';
  const syncIntervalMs = options.syncIntervalMs ?? 30_000;
  const syncOnChangeDebounceMs = options.syncOnChangeDebounceMs ?? 2_000;
  const onSessionInactive = options.onSessionInactive;
  const onSyncError = options.onSyncError;
  const dirtySetsRef = useRef(new Map<string, SyncableSetInput>());
  const syncTimeoutRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);

  const syncMutation = useMutation({
    mutationFn: async (payload: SyncPayload) => {
      if (!normalizedSessionId) {
        return [];
      }

      return batchUpsertSessionSets(normalizedSessionId, payload);
    },
    onSuccess: async () => {
      if (!normalizedSessionId) {
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: workoutSessionQueryKeys.detail(normalizedSessionId),
      });
    },
  });

  const flushDirtySets = useCallback(
    async (input?: { keepalive?: boolean }) => {
      if (!normalizedSessionId || syncInFlightRef.current) {
        return;
      }

      if (dirtySetsRef.current.size === 0) {
        return;
      }

      const pendingSets = [...dirtySetsRef.current.values()];
      dirtySetsRef.current = new Map();
      syncInFlightRef.current = true;

      try {
        await syncMutation.mutateAsync({
          keepalive: input?.keepalive,
          sets: pendingSets,
        });
      } catch (error) {
        const typedError = error instanceof Error ? error : new Error('Failed to sync workout sets');

        if (
          error instanceof ApiError &&
          error.status === 409 &&
          error.code === 'WORKOUT_SESSION_NOT_ACTIVE'
        ) {
          onSessionInactive?.();
          return;
        }

        for (const set of pendingSets) {
          const setKey = getSetKey(set);
          if (!dirtySetsRef.current.has(setKey)) {
            dirtySetsRef.current.set(setKey, set);
          }
        }

        onSyncError?.(typedError);
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [normalizedSessionId, onSessionInactive, onSyncError, syncMutation],
  );

  const scheduleSync = useCallback(() => {
    if (!normalizedSessionId) {
      return;
    }

    if (syncTimeoutRef.current !== null) {
      window.clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = window.setTimeout(() => {
      syncTimeoutRef.current = null;
      void flushDirtySets();
    }, syncOnChangeDebounceMs);
  }, [flushDirtySets, normalizedSessionId, syncOnChangeDebounceMs]);

  const queueSetSync = useCallback(
    (set: SyncableSetInput) => {
      if (!normalizedSessionId) {
        return;
      }

      const parsedSet = batchUpsertSetsSchema.parse({ sets: [set] }).sets[0];
      dirtySetsRef.current.set(getSetKey(parsedSet), parsedSet);
      scheduleSync();
    },
    [normalizedSessionId, scheduleSync],
  );

  useEffect(() => {
    if (!normalizedSessionId) {
      dirtySetsRef.current.clear();
      return;
    }

    const intervalId = window.setInterval(() => {
      void flushDirtySets();
    }, syncIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [flushDirtySets, normalizedSessionId, syncIntervalMs]);

  useEffect(() => {
    if (!normalizedSessionId) {
      return;
    }

    const handleBeforeUnload = () => {
      if (dirtySetsRef.current.size === 0) {
        return;
      }

      void flushDirtySets({ keepalive: true });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flushDirtySets, normalizedSessionId]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current !== null) {
        window.clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  return {
    flushDirtySets,
    isSyncing: syncMutation.isPending,
    queueSetSync,
  };
}

export type { SyncableSetInput, UseSyncSetsOptions };
