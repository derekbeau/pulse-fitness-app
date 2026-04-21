import type { ActiveWorkoutSetDrafts } from '@/features/workouts/types';

export const ACTIVE_WORKOUT_SESSION_STORAGE_KEY = 'pulse.active-workout-session-id';
export const ACTIVE_WORKOUT_DRAFT_STORAGE_PREFIX = 'pulse.active-workout-draft';
export const WORKOUT_SECTIONS_STORAGE_PREFIX = 'pulse.workout-sections';
export const WORKOUT_EXERCISES_STORAGE_PREFIX = 'pulse.workout-exercises';
export const WORKOUT_SESSION_NOTICE_QUERY_KEY = 'sessionNotice';
export const WORKOUT_SESSION_COMPLETED_NOTICE = 'completed';

type ActiveWorkoutDraft = {
  exerciseNotes: Record<string, string>;
  sessionCuesByExercise: Record<string, string[]>;
  setDrafts: ActiveWorkoutSetDrafts;
};

export function mergeServerSetDrafts(
  currentSetDrafts: ActiveWorkoutSetDrafts,
  serverSetDrafts: ActiveWorkoutSetDrafts,
) {
  const nextDrafts: ActiveWorkoutSetDrafts = {};

  for (const [exerciseId, serverExerciseDrafts] of Object.entries(serverSetDrafts)) {
    const currentExerciseDrafts = currentSetDrafts[exerciseId] ?? [];

    nextDrafts[exerciseId] = serverExerciseDrafts.map((serverSetDraft) => {
      const currentDraft = currentExerciseDrafts.find(
        (set) => set.number === serverSetDraft.number,
      );

      if (!currentDraft) {
        return serverSetDraft;
      }

      if (currentDraft.completed || serverSetDraft.completed) {
        // Completed sets are server-authoritative; this may replace uncommitted local input if
        // an external actor completed the set between poll intervals.
        return serverSetDraft;
      }

      return {
        ...serverSetDraft,
        distance: currentDraft.distance,
        reps: currentDraft.reps,
        seconds: currentDraft.seconds,
        targetDistance: currentDraft.targetDistance,
        targetSeconds: currentDraft.targetSeconds,
        targetWeight: currentDraft.targetWeight,
        targetWeightMax: currentDraft.targetWeightMax,
        targetWeightMin: currentDraft.targetWeightMin,
        weight: currentDraft.weight,
      };
    });
  }

  return nextDrafts;
}

export function mergeExerciseNotes(
  local: Record<string, string>,
  server: Record<string, string>,
): Record<string, string> {
  const mergedNotes: Record<string, string> = {};

  for (const [exerciseId, serverNote] of Object.entries(server)) {
    const localNote = local[exerciseId];

    if (typeof serverNote === 'string' && serverNote.trim().length > 0) {
      mergedNotes[exerciseId] = serverNote;
      continue;
    }

    if (typeof localNote === 'string' && localNote.trim().length > 0) {
      mergedNotes[exerciseId] = localNote;
      continue;
    }

    mergedNotes[exerciseId] = serverNote;
  }

  return mergedNotes;
}

function canUseLocalStorage() {
  return typeof window !== 'undefined';
}

function getSessionScopedStorageKey(prefix: string, id: string) {
  const normalizedId = id.trim();

  if (!normalizedId) {
    return null;
  }

  return `${prefix}:${normalizedId}`;
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
  return getSessionScopedStorageKey(ACTIVE_WORKOUT_DRAFT_STORAGE_PREFIX, id);
}

export function getWorkoutSectionStorageKey(id: string) {
  return getSessionScopedStorageKey(WORKOUT_SECTIONS_STORAGE_PREFIX, id);
}

export function getWorkoutExerciseStorageKey(id: string) {
  return getSessionScopedStorageKey(WORKOUT_EXERCISES_STORAGE_PREFIX, id);
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
      sessionCuesByExercise: parsed.sessionCuesByExercise ?? {},
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

export function clearStoredWorkoutSessionUiState(id: string) {
  if (!canUseLocalStorage()) {
    return;
  }

  const sectionKey = getWorkoutSectionStorageKey(id);
  const exerciseKey = getWorkoutExerciseStorageKey(id);

  if (sectionKey) {
    window.localStorage.removeItem(sectionKey);
  }

  if (exerciseKey) {
    window.localStorage.removeItem(exerciseKey);
  }
}
