import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WorkoutExerciseSetList } from './workout-exercise-set-list';

describe('WorkoutExerciseSetList', () => {
  it('renders template/scheduled modes as readonly set rows', () => {
    const { container } = render(
      <WorkoutExerciseSetList
        mode="readonly-template"
        sets={[
          {
            reps: null,
            setNumber: 1,
            targetWeight: 65,
          },
        ]}
        trackingType="weight_reps"
        weightUnit="lbs"
      />,
    );

    expect(screen.getByText('Target: 65 lbs')).toBeInTheDocument();
    expect(container.querySelector('.pointer-events-none')).not.toBeNull();
  });

  it('renders completed mode with value-only rows', () => {
    render(
      <WorkoutExerciseSetList
        mode="readonly-completed"
        sets={[
          {
            completed: true,
            reps: 8,
            setNumber: 1,
            weight: 135,
          },
        ]}
        trackingType="weight_reps"
        weightUnit="lbs"
      />,
    );

    expect(screen.getByLabelText('Weight for set 1')).toHaveValue(135);
    expect(screen.getByLabelText('Reps for set 1')).toHaveValue(8);
  });
});

it('shows completed native, legacy, and missing effort through the read-only display', () => {
  render(
    <WorkoutExerciseSetList
      mode="readonly-completed"
      trackingType="weight_reps"
      weightUnit="lbs"
      sets={[
        { reps: 8, weight: 135, setNumber: 1, rir: 0 },
        { reps: 8, weight: 135, setNumber: 2, rpe: 8 },
        { reps: 8, weight: 135, setNumber: 3, rir: 5 },
        { reps: 8, weight: 135, setNumber: 4 },
      ]}
    />,
  );
  expect(screen.getByText('0 RIR')).toBeInTheDocument();
  expect(screen.getByText('≈ 2 RIR')).toBeInTheDocument();
  expect(screen.getByText('5+ RIR')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Effort details: Set 4' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Effort details: Set 2' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Derived approximately from stored RPE 8');
  expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
});
