import { render, screen } from '@testing-library/react';
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

  it('renders a sticky session header and the active workout list', () => {
    render(<ActiveWorkoutPage />);

    const heading = screen.getByRole('heading', { level: 1, name: 'Upper Push' });
    const headerCard = heading.closest('[data-slot="card"]');

    expect(headerCard).toHaveClass('sticky');
    expect(screen.getByText('Exercise 3 of 7')).toBeInTheDocument();
    expect(screen.getByText('Warmup (2/2 exercises done)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Incline Dumbbell Press' })).toBeInTheDocument();
  });
});
