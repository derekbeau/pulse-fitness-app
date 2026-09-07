import { describe, expect, it } from 'vitest';
import {
  canonicalizeWorkoutRepTarget,
  validateWorkoutProgressionTarget,
  workoutProgressionTargetSchema,
  type WorkoutProgressionTarget,
} from './workout-progression.js';
const target: WorkoutProgressionTarget = {
  setId: 'set-1',
  setNumber: 1,
  weight: 20,
  weightMin: null,
  weightMax: null,
  reps: null,
  repsMin: null,
  repsMax: null,
  seconds: null,
  distance: null,
  zone: null,
};
describe('persisted target compatibility', () => {
  it.each([{ reps: 6 }, { repsMin: 6, repsMax: 8 }, { repsMin: 6 }, { repsMax: 8 }, {}])(
    'preserves canonical fields %j',
    (fields) => {
      const raw = { ...target, ...fields };
      expect(validateWorkoutProgressionTarget(raw, 'current_scheduled_target')).toEqual({
        target: raw,
        diagnostic: null,
      });
    },
  );
  it.each([
    { reps: 6, repsMin: 6, repsMax: 6 },
    { reps: 8, repsMin: 8 },
    { reps: 5, repsMax: 5 },
  ])('normalizes only equivalent redundancy %j', (fields) => {
    const raw = { ...target, ...fields };
    const before = { ...raw };
    for (const source of ['current_scheduled_target', 'historical_prescribed_target'] as const) {
      expect(validateWorkoutProgressionTarget(raw, source)).toEqual({
        target: { ...raw, repsMin: null, repsMax: null },
        diagnostic: { reason: 'REDUNDANT_EXACT_REPS', source, setId: raw.setId, setNumber: 1, raw },
      });
    }
    expect(raw).toEqual(before);
    expect(workoutProgressionTargetSchema.safeParse(raw).success).toBe(false);
  });
  it.each([
    { reps: 8, repsMin: 6, repsMax: 8 },
    { reps: 8, repsMin: 8, repsMax: 10 },
    { repsMin: 10, repsMax: 6 },
    { reps: 0 },
    { reps: 1001 },
    { reps: Infinity },
    { repsMin: NaN },
    { reps: 1.5 },
    { setNumber: 0 },
    { setId: '' },
  ])('fails closed without fabrication %j', (fields) => {
    for (const source of ['current_scheduled_target', 'historical_prescribed_target'] as const) {
      const result = validateWorkoutProgressionTarget({ ...target, ...fields }, source);
      expect(result.target).toBeNull();
      expect(result.diagnostic?.source).toBe(source);
      expect(result.diagnostic?.reason).not.toBe('REDUNDANT_EXACT_REPS');
    }
  });
  it('rejects contradictory writer input', () => {
    expect(() => canonicalizeWorkoutRepTarget({ reps: 8, repsMin: 6 })).toThrow(
      'CONFLICTING_REP_TARGET',
    );
  });
});
