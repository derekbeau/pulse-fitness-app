import type { WorkoutSession, WorkoutSessionListItem } from '@pulse/shared';

export function findPreviousTemplateSession(
  currentSession: WorkoutSession,
  completedSessions: WorkoutSessionListItem[],
): WorkoutSessionListItem | null {
  if (!currentSession.templateId) {
    return null;
  }

  return (
    [...completedSessions]
      .filter(
        (session) =>
          session.id !== currentSession.id &&
          session.templateId === currentSession.templateId &&
          session.startedAt < currentSession.startedAt,
      )
      .sort((left, right) => right.startedAt - left.startedAt)[0] ?? null
  );
}
