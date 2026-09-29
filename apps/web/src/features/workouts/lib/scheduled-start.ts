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

export function scheduledStartConfirmation(scheduledDate: string, today: string) {
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${scheduledDate}T12:00:00`));
  return {
    title: scheduledDate > today ? 'Start workout early?' : 'Start overdue workout?',
    description: `Scheduled for ${date}. Starting now records the workout on its actual start day; the original scheduled date remains in its history.`,
  };
}
