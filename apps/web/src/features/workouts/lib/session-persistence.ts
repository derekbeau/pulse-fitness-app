import type { ActiveWorkoutSetDrafts } from '@/features/workouts/types';

export const ACTIVE_WORKOUT_SESSION_STORAGE_KEY = 'pulse.active-workout-session-id';
export const ACTIVE_WORKOUT_DRAFT_STORAGE_PREFIX = 'pulse.active-workout-draft';
export const WORKOUT_SESSION_NOTICE_QUERY_KEY = 'sessionNotice';
export const WORKOUT_SESSION_COMPLETED_NOTICE = 'completed';

type ActiveWorkoutDraft = {
  exerciseNotes: Record<string, string>;
  setDrafts: ActiveWorkoutSetDrafts;
};

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

export function getActiveWorkoutDraftStorageKey(id: string) {
  const normalizedId = id.trim();

  if (!normalizedId) {
    return null;
  }

  return `${ACTIVE_WORKOUT_DRAFT_STORAGE_PREFIX}:${normalizedId}`;
}

export function getStoredActiveWorkoutDraft(id: string): ActiveWorkoutDraft | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const key = getActiveWorkoutDraftStorageKey(id);
  if (!key) {
    return null;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as ActiveWorkoutDraft | null;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      exerciseNotes: parsed.exerciseNotes ?? {},
      setDrafts: parsed.setDrafts ?? {},
    };
  } catch {
    return null;
  }
}

export function setStoredActiveWorkoutDraft(id: string, draft: ActiveWorkoutDraft) {
  if (!canUseLocalStorage()) {
    return;
  }

  const key = getActiveWorkoutDraftStorageKey(id);
  if (!key) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(draft));
}

export function clearStoredActiveWorkoutDraft(id: string) {
  if (!canUseLocalStorage()) {
    return;
  }

  const key = getActiveWorkoutDraftStorageKey(id);
  if (!key) {
    return;
  }

  window.localStorage.removeItem(key);
}
