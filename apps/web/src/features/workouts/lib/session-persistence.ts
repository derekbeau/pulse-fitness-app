export const ACTIVE_WORKOUT_SESSION_STORAGE_KEY = 'pulse.active-workout-session-id';
export const WORKOUT_SESSION_NOTICE_QUERY_KEY = 'sessionNotice';
export const WORKOUT_SESSION_COMPLETED_NOTICE = 'completed';

function canUseLocalStorage() {
  return typeof window !== 'undefined';
}

export function getStoredActiveWorkoutSessionId() {
  if (!canUseLocalStorage()) {
    return null;
  }

  const storedValue = window.localStorage.getItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY)?.trim();
  return storedValue ? storedValue : null;
}

export function setStoredActiveWorkoutSessionId(sessionId: string) {
  if (!canUseLocalStorage()) {
    return;
  }

  const normalizedSessionId = sessionId.trim();

  if (!normalizedSessionId) {
    return;
  }

  window.localStorage.setItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY, normalizedSessionId);
}

export function clearStoredActiveWorkoutSessionId() {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY);
}
