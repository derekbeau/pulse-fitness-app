import { describe, expect, it } from 'vitest';
import type { WorkoutTemplate } from '@pulse/shared';

import { buildInitialSessionSets } from './workout-session-sets';

describe('buildInitialSessionSets', () => {
  it('carries template set targets into created session set inputs', () => {
    const template: WorkoutTemplate = {
      id: 'template-1',
      userId: 'user-1',
      name: 'Tempo Bench Day',
      description: null,
      tags: [],
      sections: [
        {
          type: 'warmup',
          exercises: [],
        },
        {
          type: 'main',
          exercises: [
            {
              id: 'template-exercise-1',
              exerciseId: 'bench-press',
              exerciseName: 'Bench Press',
              trackingType: 'weight_reps',
              formCues: [],
              sets: 3,
              repsMin: 5,
              repsMax: 5,
              tempo: null,
              restSeconds: 120,
              supersetGroup: null,
              notes: null,
              cues: [],
              setTargets: [
                {
                  setNumber: 1,
                  targetWeight: 185,
                },
                {
                  setNumber: 2,
                  targetWeightMin: 165,
                  targetWeightMax: 175,
                },
                {
                  setNumber: 3,
                  targetWeight: 155,
                  targetSeconds: 30,
                },
              ],
            },
          ],
        },
        {
          type: 'cooldown',
          exercises: [],
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };

    expect(buildInitialSessionSets(template)).toEqual([
      {
        exerciseId: 'bench-press',
        orderIndex: 0,
        reps: null,
        section: 'main',
        setNumber: 1,
        targetWeight: 185,
        weight: null,
      },
      {
        exerciseId: 'bench-press',
        orderIndex: 0,
        reps: null,
        section: 'main',
        setNumber: 2,
        targetWeightMax: 175,
        targetWeightMin: 165,
        weight: null,
      },
      {
        exerciseId: 'bench-press',
        orderIndex: 0,
        reps: null,
        section: 'main',
        setNumber: 3,
        targetSeconds: 30,
        targetWeight: 155,
        weight: null,
      },
    ]);
  });

  it('returns an empty array when no exercises have positive set counts', () => {
    const template: WorkoutTemplate = {
      id: 'template-2',
      userId: 'user-1',
      name: 'No Sets',
      description: null,
      tags: [],
      sections: [
        {
          type: 'warmup',
          exercises: [
            {
              id: 'template-exercise-2',
              exerciseId: 'air-bike',
              exerciseName: 'Air Bike',
              trackingType: 'cardio',
              formCues: [],
              sets: null,
              repsMin: null,
              repsMax: null,
              tempo: null,
              restSeconds: null,
              supersetGroup: null,
              notes: null,
              cues: [],
            },
          ],
        },
        { type: 'main', exercises: [] },
        { type: 'cooldown', exercises: [] },
      ],
      createdAt: 1,
      updatedAt: 1,
    };

    expect(buildInitialSessionSets(template)).toEqual([]);
  });
});
