import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ExerciseHeader } from './exercise-header';

describe('ExerciseHeader', () => {
  it('renders the exercise name, tracking label, and metadata badges', () => {
    render(
      <ExerciseHeader
        exercise={{
          equipment: 'dumbbell',
          muscleGroups: ['chest', 'triceps'],
          name: 'Incline Dumbbell Press',
          notes: 'Drive through the floor.',
          phaseBadge: 'rebuild',
          priorityBadge: 'required',
          trackingType: 'weight_reps',
        }}
        targetHint="3×8-10"
      />,
    );

    expect(screen.getByText('Incline Dumbbell Press')).toBeInTheDocument();
    expect(screen.getByText('3×8-10')).toBeInTheDocument();
    expect(screen.getByText('Weight × Reps')).toBeInTheDocument();
    expect(screen.getByText('rebuild')).toBeInTheDocument();
    expect(screen.getByText('required')).toBeInTheDocument();
    expect(screen.getByText('dumbbell')).toBeInTheDocument();
    expect(screen.getByText('chest')).toBeInTheDocument();
    expect(screen.getByText('triceps')).toBeInTheDocument();
    expect(screen.getByText('Drive through the floor.')).toBeInTheDocument();
  });

  it('calls onOpenDetails when the title is clicked', () => {
    const onOpenDetails = vi.fn();

    render(
      <ExerciseHeader
        exercise={{
          name: 'Deadlift',
          trackingType: 'weight_reps',
        }}
        onOpenDetails={onOpenDetails}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deadlift' }));

    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });
});
