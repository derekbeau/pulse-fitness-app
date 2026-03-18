import { describe, expect, it } from 'vitest';

import {
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

describe('agentUpdateHabitEntryInputSchema', () => {
  it('requires at least one updatable value', () => {
    expect(() =>
      agentUpdateHabitEntryInputSchema.parse({
        date: '2026-03-12',
      }),
    ).toThrow('At least one habit entry field must be provided');
  });
});
