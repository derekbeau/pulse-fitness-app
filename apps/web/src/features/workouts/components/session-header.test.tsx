import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionHeader } from './session-header';

describe('SessionHeader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders workout progress details and counts the timer up in mm:ss', () => {
    render(
      <SessionHeader
        completedSets={5}
        currentExercise={3}
        startTime="2026-03-06T11:58:40.000Z"
        totalExercises={7}
        totalSets={17}
        workoutName="Upper Push"
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Upper Push' })).toBeInTheDocument();
    expect(screen.getByText('Exercise 3 of 7')).toBeInTheDocument();
    expect(screen.getByText('01:20')).toBeInTheDocument();
    expect(screen.getByText('5 / 17')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Workout progress' })).toHaveAttribute(
      'aria-valuenow',
      '5',
    );

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText('01:24')).toBeInTheDocument();
  });
});
