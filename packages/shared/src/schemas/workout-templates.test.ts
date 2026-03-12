import { describe, expect, it } from 'vitest';

import {
  createWorkoutTemplateInputSchema,
  reorderWorkoutTemplateExercisesInputSchema,
  type CreateWorkoutTemplateInput,
  type UpdateWorkoutTemplateInput,
  type WorkoutTemplate,
  type WorkoutTemplateSectionType,
  workoutTemplateSchema,
  updateWorkoutTemplateInputSchema,
  workoutTemplateSectionTypeSchema,
} from './workout-templates';

describe('workoutTemplateSectionTypeSchema', () => {
  it('accepts the supported section types', () => {
    const section: WorkoutTemplateSectionType = workoutTemplateSectionTypeSchema.parse('main');

    expect(section).toBe('main');
  });
});

describe('workoutTemplateSchema', () => {
  it('parses a template with canonical sections and normalized fields', () => {
    const payload = workoutTemplateSchema.parse({
      id: 'template-1',
      userId: 'user-1',
      name: ' Upper Push ',
      description: ' Pressing focus with shoulder-friendly accessories. ',
      tags: [' strength ', ' push '],
      sections: [
        {
          type: 'warmup',
          exercises: [
            {
              id: 'exercise-1',
              exerciseId: 'row-erg',
              exerciseName: ' Row Erg ',
              formCues: [' Keep shoulders packed '],
              sets: 1,
              repsMin: 240,
              repsMax: 240,
              tempo: null,
              restSeconds: 0,
              supersetGroup: null,
              notes: ' Keep this conversational. ',
              cues: [' Drive legs ', ' Relax shoulders '],
            },
          ],
        },
        {
          type: 'main',
          exercises: [],
        },
        {
          type: 'cooldown',
          exercises: [],
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    });

    const template: WorkoutTemplate = payload;

    expect(template).toEqual({
      id: 'template-1',
      userId: 'user-1',
      name: 'Upper Push',
      description: 'Pressing focus with shoulder-friendly accessories.',
      tags: ['strength', 'push'],
      sections: [
        {
          type: 'warmup',
          exercises: [
            {
              id: 'exercise-1',
              exerciseId: 'row-erg',
              exerciseName: 'Row Erg',
              formCues: ['Keep shoulders packed'],
              sets: 1,
              repsMin: 240,
              repsMax: 240,
              tempo: null,
              restSeconds: 0,
              supersetGroup: null,
              notes: 'Keep this conversational.',
              cues: ['Drive legs', 'Relax shoulders'],
            },
          ],
        },
        {
          type: 'main',
          exercises: [],
        },
        {
          type: 'cooldown',
          exercises: [],
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it('rejects templates whose sections are not in canonical order', () => {
    expect(() =>
      workoutTemplateSchema.parse({
        id: 'template-1',
        userId: 'user-1',
        name: 'Upper Push',
        description: null,
        tags: [],
        sections: [
          { type: 'main', exercises: [] },
          { type: 'warmup', exercises: [] },
          { type: 'cooldown', exercises: [] },
        ],
        createdAt: 1,
        updatedAt: 1,
      }),
    ).toThrow();
  });
});

describe('createWorkoutTemplateInputSchema', () => {
  it('normalizes nested optional fields and infers the create type', () => {
    const payload = createWorkoutTemplateInputSchema.parse({
      name: ' Lower Body ',
      description: '   ',
      tags: [' legs ', ' strength '],
      sections: [
        {
          type: 'main',
          exercises: [
            {
              exerciseId: 'high-bar-back-squat',
              sets: 4,
              repsMin: 5,
              repsMax: 8,
              tempo: ' 3110 ',
              restSeconds: 150,
              supersetGroup: ' A ',
              notes: ' Brace hard. ',
              cues: [' Spread floor ', ' Drive up '],
            },
          ],
        },
      ],
    });

    const typedPayload: CreateWorkoutTemplateInput = payload;

    expect(typedPayload).toEqual({
      name: 'Lower Body',
      description: null,
      tags: ['legs', 'strength'],
      sections: [
        {
          type: 'main',
          exercises: [
            {
              exerciseId: 'high-bar-back-squat',
              sets: 4,
              repsMin: 5,
              repsMax: 8,
              tempo: '3110',
              restSeconds: 150,
              supersetGroup: 'A',
              notes: 'Brace hard.',
              cues: ['Spread floor', 'Drive up'],
            },
          ],
        },
      ],
    });
  });

  it('rejects duplicate sections and invalid rep ranges', () => {
    expect(() =>
      createWorkoutTemplateInputSchema.parse({
        name: 'Upper',
        sections: [
          { type: 'main', exercises: [] },
          { type: 'main', exercises: [] },
        ],
      }),
    ).toThrow();

    expect(() =>
      createWorkoutTemplateInputSchema.parse({
        name: 'Upper',
        sections: [
          {
            type: 'main',
            exercises: [
              {
                exerciseId: 'press',
                repsMin: 12,
                repsMax: 8,
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
});

describe('updateWorkoutTemplateInputSchema', () => {
  it('accepts partial updates like name-only payloads', () => {
    const payload: UpdateWorkoutTemplateInput = updateWorkoutTemplateInputSchema.parse({
      name: 'Full Body',
    });

    expect(payload).toEqual({
      name: 'Full Body',
    });
  });

  it('rejects empty update payloads and duplicate sections', () => {
    expect(() => updateWorkoutTemplateInputSchema.parse({})).toThrow();

    expect(() =>
      updateWorkoutTemplateInputSchema.parse({
        sections: [
          { type: 'main', exercises: [] },
          { type: 'main', exercises: [] },
        ],
      }),
    ).toThrow();
  });
});

describe('reorderWorkoutTemplateExercisesInputSchema', () => {
  it('accepts section exercise reorder payloads', () => {
    expect(
      reorderWorkoutTemplateExercisesInputSchema.parse({
        section: 'main',
        exerciseIds: ['exercise-1', 'exercise-2'],
      }),
    ).toEqual({
      section: 'main',
      exerciseIds: ['exercise-1', 'exercise-2'],
    });
  });

  it('rejects blank exercise ids', () => {
    expect(() =>
      reorderWorkoutTemplateExercisesInputSchema.parse({
        section: 'main',
        exerciseIds: ['exercise-1', '  '],
      }),
    ).toThrow();
  });
});
