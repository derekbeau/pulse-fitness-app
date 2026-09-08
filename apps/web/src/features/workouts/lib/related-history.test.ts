import { describe, expect, it } from 'vitest';
import type { ExerciseTrackingType } from '@pulse/shared';
import type {
  ActiveWorkoutLastPerformanceSet,
  ActiveWorkoutRelatedLastPerformance,
} from '../types';
import { selectRelatedHistory } from './related-history';
import { formatCompactSets } from './tracking';

const cases: Array<[ExerciseTrackingType, Partial<ActiveWorkoutLastPerformanceSet>, string]> = [
  ['weight_reps', { weight: 0, reps: 8, rir: 0 }, '0x8 (0 RIR)'],
  ['bodyweight_reps', { weight: 0, reps: 8, rir: 0 }, '8 (0 RIR)'],
  ['reps_only', { reps: 0 }, '0'],
  ['weight_seconds', { weight: 0, seconds: 0 }, '0x0s'],
  ['reps_seconds', { reps: 5, seconds: 0 }, '5x0s'],
  ['seconds_only', { seconds: 0 }, '0s'],
  ['duration', { reps: 0 }, '0s'],
  ['distance', { distance: 0 }, '0mi'],
  ['cardio', { seconds: 0, distance: 0, rpe: 3 }, '0s/0mi (RPE 3)'],
];
describe('related preview selection', () => {
  it.each(cases)(
    'selects and formats %s without losing zero values',
    (trackingType, metrics, expected) => {
      const set = { completed: true, setNumber: 1, reps: null, weight: null, ...metrics };
      const related: ActiveWorkoutRelatedLastPerformance[] = [
        { exerciseId: 'empty', exerciseName: 'Empty', trackingType, history: null },
        {
          exerciseId: 'valid',
          exerciseName: 'Valid',
          trackingType,
          history: {
            date: '2026-09-01',
            sessionId: 'older-valid',
            notes: 'Saved note',
            sets: [{ ...set, completed: false }, { ...set, skipped: true }, set],
          },
        },
      ];
      const before = structuredClone(related);
      const result = selectRelatedHistory(related);
      expect(result.map((row) => row.exerciseId)).toEqual(['valid']);
      expect(result[0].history).toMatchObject({
        sessionId: 'older-valid',
        notes: 'Saved note',
        sets: [set],
      });
      expect(
        formatCompactSets(result[0].history.sets, trackingType, {
          useLegacySecondsFallback: trackingType !== 'reps_seconds',
        }),
      ).toBe(expected);
      expect(related).toEqual(before);
    },
  );
});
