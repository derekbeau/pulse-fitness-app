import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RestTimer } from '@/features/workouts';

describe('RestTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the provided duration as the initial countdown value', () => {
    render(<RestTimer durationSeconds={90} />);

    expect(screen.getByText('01:30')).toBeInTheDocument();
  });

  it('decrements every second', () => {
    render(<RestTimer durationSeconds={5} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('00:04')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('00:02')).toBeInTheDocument();
  });

  it('finishes at zero and fires the completion callback', () => {
    const handleComplete = vi.fn();

    render(<RestTimer durationSeconds={2} onComplete={handleComplete} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(handleComplete).toHaveBeenCalledTimes(1);
  });
});
