import {
  scheduledWorkoutListItemSchema,
  workoutSessionListItemSchema,
  type WorkoutSessionStatus,
} from '@pulse/shared';
import { z } from 'zod';

import { apiRequest } from '@/lib/api-client';

export type DayWorkoutConflictStatus = 'scheduled' | 'in-progress' | 'completed';

export type DayWorkoutConflict = {
  id: string;
  name: string;
  status: DayWorkoutConflictStatus;
};

const scheduledWorkoutListResponseSchema = z.array(scheduledWorkoutListItemSchema);
const workoutSessionListResponseSchema = z.array(workoutSessionListItemSchema);

export async function getDayWorkoutConflicts(dateKey: string): Promise<DayWorkoutConflict[]> {
  const [scheduledData, sessionData] = await Promise.all([
    apiRequest<unknown>(`/api/v1/scheduled-workouts?from=${dateKey}&to=${dateKey}`, {
      method: 'GET',
    }),
    apiRequest<unknown>(
      `/api/v1/workout-sessions?from=${dateKey}&to=${dateKey}&status=completed&status=in-progress&status=paused`,
      {
        method: 'GET',
      },
    ),
  ]);

  const scheduledWorkouts = scheduledWorkoutListResponseSchema.parse(scheduledData);
  const sessions = workoutSessionListResponseSchema.parse(sessionData);
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const consumedSessionIds = new Set<string>();
  const conflicts: DayWorkoutConflict[] = [];

  for (const scheduledWorkout of scheduledWorkouts) {
    const linkedSession = scheduledWorkout.sessionId
      ? (sessionById.get(scheduledWorkout.sessionId) ?? null)
      : null;

    if (linkedSession && isConflictSessionStatus(linkedSession.status)) {
      conflicts.push({
        id: `scheduled-${scheduledWorkout.id}`,
        name: linkedSession.templateName ?? linkedSession.name,
        status: mapSessionStatus(linkedSession.status),
      });
      consumedSessionIds.add(linkedSession.id);
      continue;
    }

    conflicts.push({
      id: `scheduled-${scheduledWorkout.id}`,
      name: scheduledWorkout.templateName ?? 'Workout unavailable',
      status: 'scheduled',
    });
  }

  for (const session of sessions) {
    if (!isConflictSessionStatus(session.status) || consumedSessionIds.has(session.id)) {
      continue;
    }

    conflicts.push({
      id: `session-${session.id}`,
      name: session.templateName ?? session.name,
      status: mapSessionStatus(session.status),
    });
  }

  return conflicts;
}

export function formatWorkoutConflictDescription(conflicts: DayWorkoutConflict[]) {
  const lines = conflicts.map(
    (conflict) => `- ${conflict.name} (${formatConflictStatusLabel(conflict.status)})`,
  );

  return ['Existing workouts:', ...lines].join('\n');
}

function isConflictSessionStatus(status: WorkoutSessionStatus) {
  return status === 'completed' || status === 'in-progress' || status === 'paused';
}

function mapSessionStatus(status: WorkoutSessionStatus): DayWorkoutConflictStatus {
  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'in-progress' || status === 'paused') {
    return 'in-progress';
  }

  return 'scheduled';
}

function formatConflictStatusLabel(status: DayWorkoutConflictStatus) {
  if (status === 'in-progress') {
    return 'in progress';
  }

  return status;
}
