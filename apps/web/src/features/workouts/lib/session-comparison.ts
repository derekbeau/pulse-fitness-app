import { workoutCompletedSessions } from './mock-data';

import type { ActiveWorkoutCompletedSession } from '../types';

export function findPreviousTemplateSession(currentSession: ActiveWorkoutCompletedSession) {
  const currentTime = new Date(currentSession.startedAt).getTime();

  return [...workoutCompletedSessions]
    .filter(
      (session) =>
        session.id !== currentSession.id &&
        session.templateId === currentSession.templateId &&
        new Date(session.startedAt).getTime() < currentTime,
    )
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())[0];
}
