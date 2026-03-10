import type { ActiveWorkoutSetDrafts } from '../types';

export const ACTIVE_WORKOUT_SESSION_STORAGE_KEY = 'pulse.active-workout-session-id';
export const WORKOUT_SESSION_NOTICE_QUERY_KEY = 'sessionNotice';
export const WORKOUT_SESSION_COMPLETED_NOTICE = 'completed';

function canUseLocalStorage() {
  return typeof window !== 'undefined';
}

function getSetDraftsStorageKey(sessionId: string) {
  return `pulse.workout-drafts.${sessionId}`;
}

function getExerciseNotesStorageKey(sessionId: string) {
  return `pulse.workout-notes.${sessionId}`;
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

export function saveSetDrafts(sessionId: string, drafts: ActiveWorkoutSetDrafts) {
  if (!canUseLocalStorage()) {
    return;
  }

  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return;
  }

  window.localStorage.setItem(getSetDraftsStorageKey(normalizedSessionId), JSON.stringify(drafts));
}

export function loadSetDrafts(sessionId: string): ActiveWorkoutSetDrafts | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return null;
  }

  const serializedDrafts = window.localStorage.getItem(getSetDraftsStorageKey(normalizedSessionId));
  if (!serializedDrafts) {
    return null;
  }

  try {
    const parsed = JSON.parse(serializedDrafts);
    return typeof parsed === 'object' && parsed !== null ? (parsed as ActiveWorkoutSetDrafts) : null;
  } catch {
    return null;
  }
}

export function clearSetDrafts(sessionId: string) {
  if (!canUseLocalStorage()) {
    return;
  }

  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return;
  }

  window.localStorage.removeItem(getSetDraftsStorageKey(normalizedSessionId));
}

export function saveExerciseNotes(sessionId: string, notes: Record<string, string>) {
  if (!canUseLocalStorage()) {
    return;
  }

  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return;
  }

  window.localStorage.setItem(
    getExerciseNotesStorageKey(normalizedSessionId),
    JSON.stringify(notes),
  );
}

export function loadExerciseNotes(sessionId: string): Record<string, string> | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return null;
  }

  const serializedNotes = window.localStorage.getItem(getExerciseNotesStorageKey(normalizedSessionId));
  if (!serializedNotes) {
    return null;
  }

  try {
    const parsed = JSON.parse(serializedNotes);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

export function clearExerciseNotes(sessionId: string) {
  if (!canUseLocalStorage()) {
    return;
  }

  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return;
  }

  window.localStorage.removeItem(getExerciseNotesStorageKey(normalizedSessionId));
}
