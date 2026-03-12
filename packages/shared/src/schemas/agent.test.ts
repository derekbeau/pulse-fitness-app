import { describe, expect, it } from 'vitest';

import {
  agentUpdateWorkoutSessionInputSchema,
  agentPatchExerciseInputSchema,
  agentCreateWorkoutTemplateInputSchema,
  type AgentCreateWorkoutTemplateInput,
} from './agent.js';

describe('agentCreateWorkoutTemplateInputSchema', () => {
  it('accepts both template cues and durable form cues on exercises', () => {
    const payload: AgentCreateWorkoutTemplateInput = agentCreateWorkoutTemplateInputSchema.parse({
      name: ' Upper A ',
      sections: [
        {
          name: ' Main ',
          exercises: [
            {
              name: ' Incline Press ',
              sets: 4,
              reps: 8,
              cues: [' week 1 keep RPE 7 '],
              formCues: [' keep wrists stacked '],
            },
          ],
        },
      ],
    });

    expect(payload).toEqual({
      name: 'Upper A',
      sections: [
        {
          name: 'Main',
          exercises: [
            {
              name: 'Incline Press',
              sets: 4,
              reps: 8,
              cues: ['week 1 keep RPE 7'],
              formCues: ['keep wrists stacked'],
            },
          ],
        },
      ],
    });
  });
});

describe('agentPatchExerciseInputSchema', () => {
  it('accepts name updates for exercise rename operations', () => {
    const payload = agentPatchExerciseInputSchema.parse({
      name: ' Incline Dumbbell Press ',
    });

    expect(payload).toEqual({
      name: 'Incline Dumbbell Press',
    });
  });
});

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
