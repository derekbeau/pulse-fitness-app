import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
    const { rerender } = render(
      <SessionHeader
        completedSets={5}
        currentExercise={3}
        estimatedTotalSeconds={3000}
        remainingSeconds={2000}
        startTime="2026-03-06T11:58:40.000Z"
        totalExercises={7}
        totalSets={17}
        workoutName="Upper Push"
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Upper Push' })).toBeInTheDocument();
    expect(screen.getByText('Exercise 3 of 7')).toBeInTheDocument();
    expect(screen.getByText('~33 min remaining (~50 min total)')).toBeInTheDocument();
    expect(screen.getByText('01:20')).toBeInTheDocument();
    expect(screen.getByText('5 / 17')).toBeInTheDocument();
    expect(screen.getByText('Start time')).toBeInTheDocument();
    const progressBar = screen.getByRole('progressbar', { name: 'Workout progress' });
    expect(progressBar).toHaveAttribute('aria-valuenow', '5');
    expect(progressBar.closest('.sticky')).toHaveClass(
      'sticky',
      'top-0',
      'z-20',
      'bg-background/95',
      'backdrop-blur-sm',
    );

    rerender(
      <SessionHeader
        completedSets={6}
        currentExercise={3}
        estimatedTotalSeconds={3000}
        remainingSeconds={1800}
        startTime="2026-03-06T11:58:40.000Z"
        totalExercises={7}
        totalSets={17}
        workoutName="Upper Push"
      />,
    );
    expect(screen.getByText('6 / 17')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Workout progress' })).toHaveAttribute(
      'aria-valuenow',
      '6',
    );

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText('01:24')).toBeInTheDocument();
  });

  it('allows editing start time and immediately recalculates elapsed time', () => {
    function Harness() {
      const [startTime, setStartTime] = useState(() => new Date(Date.now() - 80_000).toISOString());

      return (
        <SessionHeader
          completedSets={5}
          currentExercise={3}
          onStartTimeChange={(nextStartTime) => setStartTime(nextStartTime)}
          estimatedTotalSeconds={3000}
          remainingSeconds={2000}
          startTime={startTime}
          totalExercises={7}
          totalSets={17}
          workoutName="Upper Push"
        />
      );
    }

    render(<Harness />);

    expect(screen.getByText('01:20')).toBeInTheDocument();

    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    const tenMinutesAgoInput = `${`${tenMinutesAgo.getHours()}`.padStart(2, '0')}:${`${tenMinutesAgo.getMinutes()}`.padStart(2, '0')}`;

    const startTimeButton = screen.getByRole('button', {
      name: new RegExp('^[0-9]{1,2}:[0-9]{2} [AP]M$'),
    });
    fireEvent.click(startTimeButton);
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: tenMinutesAgoInput },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));

    expect(screen.getByText('10:00')).toBeInTheDocument();
  });
});
