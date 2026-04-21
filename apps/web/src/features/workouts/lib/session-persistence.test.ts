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
  mergeExerciseNotes,
  mergeServerSetDrafts,
  setStoredActiveWorkoutDraft,
  setStoredActiveWorkoutSessionId,
} from './session-persistence';

type MergeDraftSet = ActiveWorkoutSetDrafts[string][number] & {
  orderIndex?: number;
  section?: string | null;
  skipped?: boolean;
  supersetGroup?: string | null;
};

function createDraftSet(overrides: Partial<MergeDraftSet> = {}): MergeDraftSet {
  return {
    completed: false,
    distance: null,
    id: 'set-1',
    number: 1,
    reps: 8,
    seconds: null,
    weight: 100,
    ...overrides,
  };
}

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

describe('mergeServerSetDrafts', () => {
  it('uses server values for completed sets even when local has in-progress edits', () => {
    const local: ActiveWorkoutSetDrafts = {
      squat: [createDraftSet({ reps: 5, weight: 225 })],
    };
    const server: ActiveWorkoutSetDrafts = {
      squat: [createDraftSet({ completed: true, reps: 8, weight: 245 })],
    };

    expect(mergeServerSetDrafts(local, server)).toEqual(server);
  });

  it('uses server values for skipped sets', () => {
    const local: ActiveWorkoutSetDrafts = {
      squat: [createDraftSet({ reps: 5, weight: 225 })],
    };
    const server: ActiveWorkoutSetDrafts = {
      squat: [createDraftSet({ completed: true, reps: null, skipped: true, weight: null })],
    };

    expect(mergeServerSetDrafts(local, server)).toEqual(server);
  });

  it('keeps local editable fields for in-progress sets while syncing structural server fields', () => {
    const local: ActiveWorkoutSetDrafts = {
      squat: [
        createDraftSet({
          distance: 0.25,
          reps: 6,
          seconds: 45,
          targetWeight: 205,
          targetWeightMax: 215,
          targetWeightMin: 195,
          weight: 185,
        }),
      ],
    };
    const server: ActiveWorkoutSetDrafts = {
      squat: [
        createDraftSet({
          distance: null,
          orderIndex: 3,
          reps: 10,
          section: 'main',
          supersetGroup: 'A',
          targetWeight: 205,
          targetWeightMax: 215,
          targetWeightMin: 195,
          weight: 135,
        }),
      ],
    };

    expect(mergeServerSetDrafts(local, server)).toEqual({
      squat: [
        createDraftSet({
          distance: 0.25,
          orderIndex: 3,
          reps: 6,
          seconds: 45,
          section: 'main',
          supersetGroup: 'A',
          targetWeight: 205,
          targetWeightMax: 215,
          targetWeightMin: 195,
          weight: 185,
        }),
      ],
    });
  });

  it('drops local exercises that are missing from the server payload', () => {
    const local: ActiveWorkoutSetDrafts = {
      carry: [createDraftSet({ id: 'carry-1' })],
    };

    expect(mergeServerSetDrafts(local, {})).toEqual({});
  });

  it('initializes exercises present only on the server', () => {
    const server: ActiveWorkoutSetDrafts = {
      row: [createDraftSet({ id: 'row-1', reps: 12 })],
    };

    expect(mergeServerSetDrafts({}, server)).toEqual(server);
  });

  it('passes through all server data when local drafts are empty', () => {
    const server: ActiveWorkoutSetDrafts = {
      row: [createDraftSet({ id: 'row-1', reps: 12 })],
    };

    expect(mergeServerSetDrafts({}, server)).toEqual(server);
  });

  it('is total when the server payload is empty', () => {
    const local: ActiveWorkoutSetDrafts = {
      row: [createDraftSet({ id: 'row-1', reps: 12 })],
    };

    expect(mergeServerSetDrafts(local, {})).toEqual({});
  });
});

describe('mergeExerciseNotes', () => {
  it('prefers non-empty server notes over local notes', () => {
    expect(
      mergeExerciseNotes(
        { squat: 'Local note' },
        { squat: 'Server note', deadlift: 'Deadlift cue' },
      ),
    ).toEqual({
      deadlift: 'Deadlift cue',
      squat: 'Server note',
    });
  });

  it('keeps local notes when server note is empty', () => {
    expect(mergeExerciseNotes({ squat: 'Local note' }, { squat: '' })).toEqual({
      squat: 'Local note',
    });
  });

  it('keeps server-only exercise notes', () => {
    expect(mergeExerciseNotes({}, { squat: 'Server note' })).toEqual({
      squat: 'Server note',
    });
  });

  it('drops local-only exercise notes that are not in server payload', () => {
    expect(mergeExerciseNotes({ squat: 'Local note' }, {})).toEqual({});
  });
});
