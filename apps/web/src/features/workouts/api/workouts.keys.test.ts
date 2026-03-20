import { describe, expect, it } from 'vitest';

import { workoutQueryKeys } from './workouts';

describe('workoutQueryKeys', () => {
  it('returns a stable session detail key', () => {
    expect(workoutQueryKeys.session('abc')).toEqual(['workouts', 'session', 'abc']);
  });

  it('normalizes the session list params into the standardized key shape', () => {
    expect(
      workoutQueryKeys.sessionList({
        limit: 10,
        status: ['completed', 'cancelled'],
      }),
    ).toEqual([
      'workouts',
      'sessions',
      {
        from: null,
        limit: 10,
        status: 'completed|cancelled',
        to: null,
      },
    ]);
  });

  it('returns a stable template list key', () => {
    expect(workoutQueryKeys.templateList()).toEqual(['workouts', 'templates']);
    expect(workoutQueryKeys.templateList({ sort: 'name-desc' })).toEqual([
      'workouts',
      'templates',
      {
        limit: 25,
        page: 1,
        sort: 'name-desc',
      },
    ]);
  });

  it('returns a stable template detail prefix key', () => {
    expect(workoutQueryKeys.templateDetailPrefix()).toEqual(['workouts', 'template']);
  });

  it('returns stable scheduled-workout and session detail prefixes', () => {
    expect(workoutQueryKeys.scheduledWorkoutListRoot()).toEqual(['workouts', 'scheduled-workouts']);
    expect(workoutQueryKeys.sessionDetailPrefix()).toEqual(['workouts', 'session']);
  });
});
