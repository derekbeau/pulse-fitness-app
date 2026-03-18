import { describe, expect, it } from 'vitest';

import {
  agentUpdateWorkoutSessionInputSchema,
} from './agent.js';

describe('agentUpdateWorkoutSessionInputSchema', () => {
  it('accepts mid-session exercise mutations', () => {
    const payload = agentUpdateWorkoutSessionInputSchema.parse({
      addExercises: [{ name: 'Goblet Squat', sets: 2, reps: 10 }],
      removeExercises: ['exercise-1'],
      reorderExercises: ['exercise-2', 'exercise-1'],
    });

    expect(payload).toEqual({
      addExercises: [{ name: 'Goblet Squat', sets: 2, reps: 10, section: 'main' }],
      removeExercises: ['exercise-1'],
      reorderExercises: ['exercise-2', 'exercise-1'],
    });
  });
});
