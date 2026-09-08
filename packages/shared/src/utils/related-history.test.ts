import { describe, expect, it } from 'vitest';
import type { ExerciseTrackingType } from '../schemas/exercises.js';
import { isMeaningfulCompletedSet } from './related-history.js';

const cases: Array<[ExerciseTrackingType, Record<string, number | null>]> = [
  ['weight_reps', { weight: 0, reps: 8, rir: 0 }],
  ['bodyweight_reps', { weight: null, reps: 8 }],
  ['bodyweight_reps', { weight: 0, reps: 0 }],
  ['reps_only', { reps: 0 }],
  ['weight_seconds', { weight: 0, seconds: 0 }],
  ['reps_seconds', { reps: 0 }],
  ['reps_seconds', { seconds: 0 }],
  ['seconds_only', { seconds: 0 }],
  ['duration', { seconds: 0 }],
  ['duration', { reps: 0 }],
  ['distance', { distance: 0 }],
  ['distance', { reps: 0 }],
  ['cardio', { distance: 0 }],
  ['cardio', { seconds: 0 }],
  ['cardio', { reps: 0 }],
];

describe('meaningful completed related performance', () => {
  it.each(cases)('keeps recorded values for %s: %j', (trackingType, metrics) => {
    const set = { completed: true, ...metrics };
    expect(isMeaningfulCompletedSet(set, trackingType)).toBe(true);
    expect(isMeaningfulCompletedSet({ ...set, completed: false }, trackingType)).toBe(false);
    expect(isMeaningfulCompletedSet({ ...set, skipped: true }, trackingType)).toBe(false);
  });
  it.each([...new Set(cases.map(([type]) => type))])(
    'rejects empty/load/effort-only %s',
    (type) => {
      for (const metrics of [{}, { weight: 0 }, { rir: 0 }, { rpe: 8 }]) {
        expect(isMeaningfulCompletedSet({ completed: true, ...metrics }, type)).toBe(false);
      }
    },
  );
  it('rejects populated fields outside the tracking contract', () => {
    expect(isMeaningfulCompletedSet({ completed: true, seconds: 30 }, 'weight_reps')).toBe(false);
    expect(isMeaningfulCompletedSet({ completed: true, distance: 1 }, 'duration')).toBe(false);
    expect(isMeaningfulCompletedSet({ completed: true, seconds: 30 }, 'distance')).toBe(false);
  });
});
