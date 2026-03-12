import { describe, expect, it } from 'vitest';

import {
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
