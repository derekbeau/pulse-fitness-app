import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActiveWorkoutPage } from './active-workout';

describe('ActiveWorkoutPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the active workout UI and advances focus after the rest timer completes', () => {
    render(<ActiveWorkoutPage />);

    const heading = screen.getByRole('heading', { level: 1, name: 'Upper Push' });
    const headerCard = heading.closest('[data-slot="card"]');

    expect(headerCard).toHaveClass('sticky');
    expect(screen.getByText('Exercise 3 of 7')).toBeInTheDocument();
    expect(screen.getByText('Warmup (2/2 exercises done)')).toBeInTheDocument();

    const inclineCard = screen
      .getByRole('heading', { level: 3, name: 'Incline Dumbbell Press' })
      .closest('[data-slot="card"]');
    expect(inclineCard).not.toBeNull();

    fireEvent.click(within(inclineCard as HTMLElement).getByLabelText('Complete set 3'));

    expect(screen.getByText('Rest Timer')).toBeInTheDocument();
    expect(screen.getByText('After Incline Dumbbell Press')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(90_100);
    });

    const nextExerciseCard = screen
      .getByRole('heading', { level: 3, name: 'Seated Dumbbell Shoulder Press' })
      .closest('[data-slot="card"]');
    expect(nextExerciseCard).not.toBeNull();
    expect(within(nextExerciseCard as HTMLElement).getByLabelText('Reps for set 1')).toHaveFocus();
    expect(screen.queryByText('Rest Timer')).not.toBeInTheDocument();
  });
});
