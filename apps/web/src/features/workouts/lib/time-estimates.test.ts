import { describe, expect, it } from 'vitest';

import type { ActiveWorkoutExercise, ActiveWorkoutSection, ActiveWorkoutSessionData } from '../types';
import {
  estimateExerciseTime,
  estimateRemainingExerciseTime,
  estimateRemainingTime,
  estimateSectionTime,
  estimateTotalTime,
  formatEstimateMinutes,
  formatRestDuration,
  formatTempo,
} from './time-estimates';

function makeExercise(overrides: Partial<ActiveWorkoutExercise> = {}): ActiveWorkoutExercise {
  return {
    badges: ['compound'],
    category: 'compound',
    completedSets: 0,
    formCues: null,
    id: 'exercise-1',
    injuryCues: [],
    lastPerformance: null,
    name: 'Back Squat',
    notes: '',
    phaseBadge: 'moderate',
    prescribedReps: '8-10',
    priority: 'required',
    restSeconds: 90,
    reversePyramid: [],
    sets: [],
    supersetGroup: null,
    targetSets: 3,
    tempo: '3110',
    trackingType: 'weight_reps',
    ...overrides,
  };
}

describe('time-estimates', () => {
  it('estimates exercise duration using tempo, reps, sets, and rest', () => {
    const seconds = estimateExerciseTime(makeExercise());

    // avg reps for 8-10 is 9, tempo 3-1-1-0 is 5 seconds/rep.
    // per set: 45 sec work + 90 sec rest, no rest after final set.
    expect(seconds).toBe(315);
  });

  it('falls back to 3 sec per rep when tempo is missing', () => {
    const seconds = estimateExerciseTime(
      makeExercise({
        prescribedReps: '10',
        restSeconds: 60,
        targetSets: 2,
        tempo: null,
      }),
    );

    // per set: 30 sec work + 60 sec rest, no rest after final set.
    expect(seconds).toBe(120);
  });

  it('parses hyphen-delimited multi-digit tempo segments correctly', () => {
    const seconds = estimateExerciseTime(
      makeExercise({
        prescribedReps: '5',
        restSeconds: 60,
        targetSets: 2,
        tempo: '10-1-1-0',
      }),
    );

    // per rep: 12 sec. per set: 60 sec work + 60 sec rest, no rest after final set.
    expect(seconds).toBe(180);
  });

  it('estimates remaining time from remaining sets only', () => {
    const remainingSeconds = estimateRemainingExerciseTime(
      makeExercise({
        completedSets: 1,
        targetSets: 3,
      }),
    );

    expect(remainingSeconds).toBe(180);
  });

  it('aggregates section and session estimates', () => {
    const section: ActiveWorkoutSection = {
      exercises: [makeExercise(), makeExercise({ id: 'exercise-2', targetSets: 2 })],
      id: 'main',
      title: 'Main',
      type: 'main',
    };

    const session: ActiveWorkoutSessionData = {
      completedSets: 0,
      currentExercise: 1,
      currentExerciseId: 'exercise-1',
      sections: [section],
      totalExercises: 2,
      totalSets: 5,
      workoutName: 'Test Workout',
    };

    expect(estimateSectionTime(section)).toBe(495);
    expect(estimateTotalTime(session)).toBe(495);
  });

  it('reduces remaining session estimate as sets are completed', () => {
    const session: ActiveWorkoutSessionData = {
      completedSets: 2,
      currentExercise: 1,
      currentExerciseId: 'exercise-1',
      sections: [
        {
          exercises: [
            makeExercise({ completedSets: 2, targetSets: 3 }),
            makeExercise({ id: 'exercise-2', completedSets: 0, targetSets: 2 }),
          ],
          id: 'main',
          title: 'Main',
          type: 'main',
        },
      ],
      totalExercises: 2,
      totalSets: 5,
      workoutName: 'Test Workout',
    };

    expect(estimateRemainingTime(session)).toBe(225);
  });

  it('formats estimate/minutes, rest duration, and tempo labels', () => {
    expect(formatEstimateMinutes(490)).toBe('~8 min');
    expect(formatRestDuration(150)).toBe('2:30');
    expect(formatTempo('3110')).toBe('3-1-1-0');
  });
});
