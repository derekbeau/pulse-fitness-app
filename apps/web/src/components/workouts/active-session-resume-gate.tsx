import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import type { WorkoutSession } from '@pulse/shared';
import { workoutSessionSchema } from '@pulse/shared';
import { z } from 'zod';

import { ApiError, apiRequest } from '@/lib/api-client';
import {
  WORKOUT_SESSION_COMPLETED_NOTICE,
  WORKOUT_SESSION_NOTICE_QUERY_KEY,
  clearStoredActiveWorkoutSessionId,
  getStoredActiveWorkoutSessionId,
} from '@/features/workouts/lib/session-persistence';

const workoutSessionResponseSchema = z.object({
  data: workoutSessionSchema,
}) as unknown as z.ZodType<{ data: WorkoutSession }>;

async function getWorkoutSession(sessionId: string) {
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}`);
  const payload = workoutSessionResponseSchema.parse({ data });

  return payload.data;
}

function buildResumePath(session: WorkoutSession) {
  const params = new URLSearchParams();
  params.set('sessionId', session.id);

  if (session.templateId) {
    params.set('template', session.templateId);
  }

  return `/workouts/active?${params.toString()}`;
}

export function ActiveSessionResumeGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (hasCheckedRef.current) {
      return;
    }

    hasCheckedRef.current = true;
    const storedSessionId = getStoredActiveWorkoutSessionId();

    if (!storedSessionId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const session = await getWorkoutSession(storedSessionId);

        if (cancelled) {
          return;
        }

        if (session.status === 'in-progress') {
          const currentSessionId = new URLSearchParams(location.search).get('sessionId');
          if (location.pathname !== '/workouts/active' || currentSessionId !== session.id) {
            navigate(buildResumePath(session), { replace: true });
          }
          return;
        }

        clearStoredActiveWorkoutSessionId();

        if (session.status === 'completed') {
          navigate(
            `/workouts?${WORKOUT_SESSION_NOTICE_QUERY_KEY}=${WORKOUT_SESSION_COMPLETED_NOTICE}`,
            {
              replace: true,
            },
          );
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          clearStoredActiveWorkoutSessionId();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate]);

  return null;
}
