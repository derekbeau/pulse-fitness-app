import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SetRow } from '@/features/workouts';
import type { WorkoutSet } from '@/features/workouts';

const baseSet: WorkoutSet = {
  id: 'set-1',
  weight: 135,
  reps: 8,
  completed: false,
};

describe('SetRow', () => {
  it('fires onChange with the parsed weight value', () => {
    const handleChange = vi.fn();

    render(<SetRow set={baseSet} index={0} onChange={handleChange} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Set 1 weight' }), {
      target: { value: '145.5' },
    });

    expect(handleChange).toHaveBeenCalledWith({
      ...baseSet,
      weight: 145.5,
    });
  });

  it('fires onChange with the parsed reps value', () => {
    const handleChange = vi.fn();

    render(<SetRow set={baseSet} index={0} onChange={handleChange} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Set 1 reps' }), {
      target: { value: '10' },
    });

    expect(handleChange).toHaveBeenCalledWith({
      ...baseSet,
      reps: 10,
    });
  });

  it('toggles completion through the checkbox', () => {
    const handleChange = vi.fn();

    render(<SetRow set={baseSet} index={0} onChange={handleChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Complete set 1' }));

    expect(handleChange).toHaveBeenCalledWith({
      ...baseSet,
      completed: true,
    });
  });

  it('calls the add set callback when the button is clicked', () => {
    const handleAddSet = vi.fn();

    render(<SetRow set={baseSet} index={0} onChange={vi.fn()} onAddSet={handleAddSet} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add set' }));

    expect(handleAddSet).toHaveBeenCalledTimes(1);
  });
});
