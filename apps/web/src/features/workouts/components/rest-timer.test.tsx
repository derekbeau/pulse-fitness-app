import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RestTimer } from './rest-timer';

describe('RestTimer', () => {
  const originalVibrate = navigator.vibrate;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: originalVibrate,
    });
  });

  it('starts automatically, counts down, and vibrates on completion', () => {
    const onComplete = vi.fn();

    render(<RestTimer autoStart duration={3} onComplete={onComplete} />);

    expect(screen.getByText('Rest: 3s')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3_100);
    });

    expect(screen.getByText('Rest: 0s')).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(200);
  });

  it('pauses and resumes the countdown', () => {
    const onComplete = vi.fn();

    render(<RestTimer autoStart duration={5} onComplete={onComplete} />);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('Rest: 3s')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByText('Rest: 3s')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    act(() => {
      vi.advanceTimersByTime(3_100);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('skips without vibrating', () => {
    const onComplete = vi.fn();

    render(<RestTimer autoStart duration={10} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(navigator.vibrate).not.toHaveBeenCalled();
    expect(screen.getByText('Rest: 0s')).toBeInTheDocument();
  });
});
