import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { workoutSupplementalExercises } from '../lib/mock-data';
import { SupplementalMenu } from './supplemental-menu';

describe('SupplementalMenu', () => {
  it('renders grouped supplemental exercises and toggles completion state', () => {
    const onCheckedChange = vi.fn();

    render(
      <SupplementalMenu
        checkedByExerciseId={{}}
        exercises={workoutSupplementalExercises}
        onCheckedChange={onCheckedChange}
      />,
    );

    expect(
      screen.getByRole('button', { name: /Post-Workout Supplemental \(10-20 min\)/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Core & Spine Health (pick at least 2)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Post-Workout Supplemental/i }));

    expect(screen.getByText('Core & Spine Health (pick at least 2)')).toBeInTheDocument();
    expect(screen.getByText('ATG Additions')).toBeInTheDocument();
    expect(screen.getByText('Strength Side Additions')).toBeInTheDocument();
    expect(screen.getByText('Optional')).toBeInTheDocument();
    expect(screen.getByText('Dead Bug Breathing')).toBeInTheDocument();
    expect(screen.getByText('2 x 5 breaths/side')).toBeInTheDocument();
    expect(screen.getByText('Reverse Sled Drag')).toBeInTheDocument();
    expect(screen.getByText('4 x 60 m')).toBeInTheDocument();
    expect(screen.getByText('Bottoms-Up Kettlebell Carry')).toBeInTheDocument();

    const deadBugRow = screen.getByText('Dead Bug Breathing').closest('label');
    expect(deadBugRow).not.toBeNull();
    expect(deadBugRow).toHaveClass('ring-1');

    fireEvent.click(
      within(deadBugRow as HTMLElement).getByRole('checkbox', {
        name: 'Complete supplemental exercise Dead Bug Breathing',
      }),
    );

    expect(onCheckedChange).toHaveBeenCalledWith('dead-bug-breathing', true);
  });

  it('reflects checked state in the completed summary and row styling', () => {
    render(
      <SupplementalMenu
        checkedByExerciseId={{ 'dead-bug-breathing': true }}
        exercises={workoutSupplementalExercises}
        onCheckedChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Post-Workout Supplemental/i }));

    expect(screen.getByText('1/4 completed')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Dead Bug Breathing/i })).toBeChecked();
    expect(screen.getByText('Dead Bug Breathing')).toHaveClass('line-through');
  });
});
