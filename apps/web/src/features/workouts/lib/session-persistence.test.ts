import { afterEach, describe, expect, it } from 'vitest';

import type { ActiveWorkoutSetDrafts } from '../types';
import {
  ACTIVE_WORKOUT_DRAFT_STORAGE_PREFIX,
  ACTIVE_WORKOUT_SESSION_STORAGE_KEY,
  WORKOUT_EXERCISES_STORAGE_PREFIX,
  WORKOUT_SECTIONS_STORAGE_PREFIX,
  clearStoredActiveWorkoutDraft,
  clearStoredActiveWorkoutSessionId,
  clearStoredWorkoutSessionUiState,
  getActiveWorkoutDraftStorageKey,
  getWorkoutExerciseStorageKey,
  getWorkoutSectionStorageKey,
  getStoredActiveWorkoutDraft,
  setStoredActiveWorkoutDraft,
  setStoredActiveWorkoutSessionId,
} from './session-persistence';

describe('session-persistence', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('stores and clears the active workout session id', () => {
    setStoredActiveWorkoutSessionId(' session-123 ');
    expect(window.localStorage.getItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY)).toBe('session-123');

    clearStoredActiveWorkoutSessionId();
    expect(window.localStorage.getItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('saves, loads, and clears active workout drafts by id', () => {
    const setDrafts: ActiveWorkoutSetDrafts = {
      'incline-dumbbell-press': [
        {
          completed: true,
          distance: null,
          id: 'set-1',
          number: 1,
          reps: 10,
          seconds: null,
          weight: 45,
        },
      ],
    };

    setStoredActiveWorkoutDraft('session-a', {
      exerciseNotes: {
        'incline-dumbbell-press': 'Keep elbows tucked.',
      },
      sessionCuesByExercise: {
        'incline-dumbbell-press': ['Keep shoulders down and back'],
      },
      setDrafts,
    });

    expect(getStoredActiveWorkoutDraft('session-a')).toEqual({
      exerciseNotes: {
        'incline-dumbbell-press': 'Keep elbows tucked.',
      },
      sessionCuesByExercise: {
        'incline-dumbbell-press': ['Keep shoulders down and back'],
      },
      setDrafts,
    });
    expect(getStoredActiveWorkoutDraft('session-b')).toBeNull();

    clearStoredActiveWorkoutDraft('session-a');
    expect(getStoredActiveWorkoutDraft('session-a')).toBeNull();
  });

  it('returns null for invalid draft payloads', () => {
    const key = `${ACTIVE_WORKOUT_DRAFT_STORAGE_PREFIX}:session-a`;
    window.localStorage.setItem(key, '{bad json');
    expect(getStoredActiveWorkoutDraft('session-a')).toBeNull();
  });

  it('normalizes missing draft fields', () => {
    const key = `${ACTIVE_WORKOUT_DRAFT_STORAGE_PREFIX}:session-a`;
    window.localStorage.setItem(key, JSON.stringify({}));

    expect(getStoredActiveWorkoutDraft('session-a')).toEqual({
      exerciseNotes: {},
      sessionCuesByExercise: {},
      setDrafts: {},
    });
  });

  it('returns null for blank draft ids', () => {
    expect(getActiveWorkoutDraftStorageKey('  ')).toBeNull();
    expect(getStoredActiveWorkoutDraft('  ')).toBeNull();
  });

  it('builds scoped storage keys for workout section and exercise UI state', () => {
    expect(getWorkoutSectionStorageKey('session-a')).toBe(
      `${WORKOUT_SECTIONS_STORAGE_PREFIX}:session-a`,
    );
    expect(getWorkoutExerciseStorageKey('session-a')).toBe(
      `${WORKOUT_EXERCISES_STORAGE_PREFIX}:session-a`,
    );
    expect(getWorkoutSectionStorageKey('  ')).toBeNull();
    expect(getWorkoutExerciseStorageKey('  ')).toBeNull();
  });

  it('clears persisted workout section and exercise UI state by session id', () => {
    window.localStorage.setItem(
      `${WORKOUT_SECTIONS_STORAGE_PREFIX}:session-a`,
      JSON.stringify({ warmup: false }),
    );
    window.localStorage.setItem(
      `${WORKOUT_EXERCISES_STORAGE_PREFIX}:session-a`,
      JSON.stringify({ 'row-erg': false }),
    );

    clearStoredWorkoutSessionUiState('session-a');

    expect(window.localStorage.getItem(`${WORKOUT_SECTIONS_STORAGE_PREFIX}:session-a`)).toBeNull();
    expect(window.localStorage.getItem(`${WORKOUT_EXERCISES_STORAGE_PREFIX}:session-a`)).toBeNull();
  });
});
