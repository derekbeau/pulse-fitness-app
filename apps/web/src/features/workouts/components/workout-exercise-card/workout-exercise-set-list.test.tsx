import { render, screen } from '@testing-library/react';
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
