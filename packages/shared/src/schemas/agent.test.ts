import { describe, expect, it } from 'vitest';

import {
  agentCreateWeightInputSchema,
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
