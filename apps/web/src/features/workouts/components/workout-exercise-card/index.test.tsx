import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  getWorkoutExerciseCardElementId,
  getWorkoutExerciseCardTestId,
  WorkoutExerciseCard,
} from './index';

describe('WorkoutExerciseCard', () => {
  it('orchestrates read-only template mode blocks', () => {
    render(
      <WorkoutExerciseCard
        exercise={{
          coachingNotes: 'Keep upper back tight.',
          equipment: 'barbell',
          exerciseId: 'exercise-1',
          formCues: ['Brace first'],
          id: 'template-exercise-1',
          instructions: 'Control the eccentric.',
          muscleGroups: ['back'],
          name: 'Barbell Row',
          notes: 'Drive elbows back.',
          programmingNotes: 'Top set first, then two back-off sets.',
          repsMax: 10,
          repsMin: 8,
          restSeconds: 90,
          setTargets: [{ setNumber: 1, targetWeight: 95 }],
          sets: 3,
          tempo: '2110',
          trackingType: 'weight_reps',
        }}
        mode="readonly-template"
      />,
    );

    expect(screen.getByText('Barbell Row')).toBeInTheDocument();
    expect(screen.getByText('Prescription')).toBeInTheDocument();
    expect(
      screen.getByTestId('exercise-programming-notes-template-exercise-1'),
    ).toBeInTheDocument();
    expect(screen.getByText('Show full set detail')).toBeInTheDocument();
    expect(
      screen.getByTestId(getWorkoutExerciseCardTestId('template-exercise-1')),
    ).toBeInTheDocument();
    expect(
      document.getElementById(getWorkoutExerciseCardElementId('template-exercise-1')),
    ).not.toBeNull();
  });

  it('calls onOpenDetails when exercise name is clicked', () => {
    const onOpenDetails = vi.fn();

    render(
      <WorkoutExerciseCard
        exercise={{
          completedSets: [
            {
              completed: true,
              reps: 8,
              setNumber: 1,
              weight: 135,
            },
          ],
          exerciseId: 'exercise-1',
          id: 'completed-exercise-1',
          name: 'Back Squat',
          repsMax: null,
          repsMin: null,
          restSeconds: null,
          tempo: null,
          trackingType: 'weight_reps',
        }}
        mode="readonly-completed"
        onOpenDetails={onOpenDetails}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back Squat' }));

    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it('applies condensed density by omitting prescription and form-cue blocks', () => {
    render(
      <WorkoutExerciseCard
        density="condensed"
        exercise={{
          coachingNotes: 'Cue shoulder blades down and back.',
          exerciseId: 'exercise-2',
          formCues: ['Drive knees out'],
          id: 'template-exercise-2',
          instructions: 'Stay braced throughout.',
          name: 'Front Squat',
          repsMax: 8,
          repsMin: 6,
          restSeconds: 120,
          setTargets: [{ setNumber: 1, targetWeight: 135 }],
          sets: 3,
          tempo: '3110',
          trackingType: 'weight_reps',
        }}
        mode="readonly-template"
      />,
    );

    expect(screen.queryByText('Prescription')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show form cues' })).not.toBeInTheDocument();
    expect(screen.getByText('Show set values')).toBeInTheDocument();
  });

  it('applies condensed density in readonly-completed mode', () => {
    render(
      <WorkoutExerciseCard
        density="condensed"
        exercise={{
          completedSets: [
            {
              completed: true,
              reps: 8,
              setNumber: 1,
              weight: 135,
            },
          ],
          exerciseId: 'exercise-3',
          id: 'completed-exercise-2',
          name: 'Romanian Deadlift',
          programmingNotes: 'Control the lowering phase.',
          repsMax: null,
          repsMin: null,
          restSeconds: null,
          tempo: null,
          trackingType: 'weight_reps',
        }}
        mode="readonly-completed"
      />,
    );

    expect(screen.queryByText('Prescription')).not.toBeInTheDocument();
    expect(screen.getByText('Show set values')).toBeInTheDocument();
  });
});
