import { afterEach, describe, expect, it } from 'vitest';

import type { ActiveWorkoutSetDrafts } from '../types';
import {
  clearExerciseNotes,
  clearSetDrafts,
  clearStoredActiveWorkoutSessionId,
  loadExerciseNotes,
  loadSetDrafts,
  saveExerciseNotes,
  saveSetDrafts,
  setStoredActiveWorkoutSessionId,
  ACTIVE_WORKOUT_SESSION_STORAGE_KEY,
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

  it('saves, loads, and clears set drafts by session id', () => {
    const drafts: ActiveWorkoutSetDrafts = {
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

    saveSetDrafts('session-a', drafts);
    expect(loadSetDrafts('session-a')).toEqual(drafts);
    expect(loadSetDrafts('session-b')).toBeNull();

    clearSetDrafts('session-a');
    expect(loadSetDrafts('session-a')).toBeNull();
  });

  it('returns null for invalid draft payloads', () => {
    window.localStorage.setItem('pulse.workout-drafts.session-a', '{bad json');
    expect(loadSetDrafts('session-a')).toBeNull();
  });

  it('returns null for tampered draft shapes', () => {
    window.localStorage.setItem(
      'pulse.workout-drafts.session-a',
      JSON.stringify({
        'incline-dumbbell-press': [{ id: 'set-1', completed: true }],
      }),
    );
    expect(loadSetDrafts('session-a')).toBeNull();

    window.localStorage.setItem('pulse.workout-drafts.session-a', JSON.stringify([]));
    expect(loadSetDrafts('session-a')).toBeNull();
  });

  it('saves, loads, and clears exercise notes by session id', () => {
    const notes = {
      'incline-dumbbell-press': 'Keep elbows tucked.',
    };

    saveExerciseNotes('session-a', notes);
    expect(loadExerciseNotes('session-a')).toEqual(notes);
    expect(loadExerciseNotes('session-b')).toBeNull();

    clearExerciseNotes('session-a');
    expect(loadExerciseNotes('session-a')).toBeNull();
  });

  it('returns null for invalid notes payloads', () => {
    window.localStorage.setItem('pulse.workout-notes.session-a', '{bad json');
    expect(loadExerciseNotes('session-a')).toBeNull();
  });

  it('returns null for tampered notes payload shapes', () => {
    window.localStorage.setItem(
      'pulse.workout-notes.session-a',
      JSON.stringify({
        'incline-dumbbell-press': 42,
      }),
    );
    expect(loadExerciseNotes('session-a')).toBeNull();

    window.localStorage.setItem('pulse.workout-notes.session-a', JSON.stringify([]));
    expect(loadExerciseNotes('session-a')).toBeNull();
  });
});
