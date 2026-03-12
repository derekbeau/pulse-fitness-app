import type { ScheduledWorkoutListItem, WorkoutSessionListItem } from '@pulse/shared';

export type ActiveScheduledWorkoutListItem = ScheduledWorkoutListItem & {
  templateId: string;
  templateName: string;
};

export function isActiveSessionListItem(session: WorkoutSessionListItem) {
  return session.templateId == null || session.templateName != null;
}

export function isActiveScheduledWorkout(
  scheduledWorkout: ScheduledWorkoutListItem,
): scheduledWorkout is ActiveScheduledWorkoutListItem {
  return scheduledWorkout.templateId != null && scheduledWorkout.templateName != null;
}
