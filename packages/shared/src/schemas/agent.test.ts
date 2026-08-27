import { describe, expect, it } from 'vitest';

import {
  agentCreateWeightInputSchema,
  agentContextResponseSchema,
  agentExerciseSearchParamsSchema,
  agentUpdateHabitEntryInputSchema,
} from './agent.js';

describe('agentExerciseSearchParamsSchema', () => {
  it('coerces and defaults query params', () => {
    expect(
      agentExerciseSearchParamsSchema.parse({
        q: ' press ',
      }),
    ).toEqual({
      q: 'press',
      limit: 10,
    });
  });
});

describe('agentCreateWeightInputSchema', () => {
  it.each([
    [{ date: '2026-03-12', weight: 55, unit: 'lbs' }, false],
    [{ date: '2026-03-12', weight: 55.12, unit: 'lbs' }, true],
    [{ date: '2026-03-12', weight: 771.6179176, unit: 'lbs' }, true],
    [{ date: '2026-03-12', weight: 772, unit: 'lbs' }, false],
    [{ date: '2026-03-12', weight: 25, unit: 'kg' }, true],
    [{ date: '2026-03-12', weight: 24.99, unit: 'kg' }, false],
    [{ date: '2026-03-12', weight: 350, unit: 'kg' }, true],
    [{ date: '2026-03-12', weight: 350.01, unit: 'kg' }, false],
  ] as const)('enforces canonical bounds for %#', (input, expected) => {
    expect(agentCreateWeightInputSchema.safeParse(input).success).toBe(expected);
  });
});

describe('agentUpdateHabitEntryInputSchema', () => {
  it('requires at least one updatable value', () => {
    expect(() =>
      agentUpdateHabitEntryInputSchema.parse({
        date: '2026-03-12',
      }),
    ).toThrow('At least one habit entry field must be provided');
  });
});

describe('agentContextResponseSchema', () => {
  const context = {
    user: { name: 'Derek' },
    recentWorkouts: [],
    todayNutrition: {
      actual: { calories: 1_800, protein: 150, carbs: 180, fat: 60 },
      target: { calories: 2_200, protein: 180, carbs: 250, fat: 70 },
      proteinFloor: {
        actualProteinGrams: 150,
        proteinFloorGrams: 180,
        remainingToFloorGrams: 30,
        amountAboveFloorGrams: 0,
        state: 'below_floor',
        isFinal: false,
      },
      meals: [],
    },
    weight: { current: 180, trend7d: -0.5, unit: 'lbs' },
    habits: [],
    scheduledWorkouts: [],
  } as const;

  it('requires Agent macro totals to agree with the structured floor fact', () => {
    expect(agentContextResponseSchema.safeParse(context).success).toBe(true);
    expect(
      agentContextResponseSchema.safeParse({
        ...context,
        todayNutrition: {
          ...context.todayNutrition,
          actual: { ...context.todayNutrition.actual, protein: 149 },
        },
      }).success,
    ).toBe(false);
    expect(
      agentContextResponseSchema.safeParse({
        ...context,
        todayNutrition: {
          ...context.todayNutrition,
          target: { ...context.todayNutrition.target, protein: 179 },
        },
      }).success,
    ).toBe(false);
  });
});
