import { createWorkoutSessionRequestSchema } from '@pulse/shared';
import type { z } from 'zod';

/** Called at the start/force event. The server retains the scheduled date. */
export function buildScheduledStartPayload(
  scheduledWorkoutId: string,
  date: string,
  options?: { startedAt?: number; force?: boolean },
): z.input<typeof createWorkoutSessionRequestSchema> {
  return {
    scheduledWorkoutId,
    date,
    startedAt: options?.startedAt ?? Date.now(),
    ...(options?.force ? { force: true } : {}),
  };
}
