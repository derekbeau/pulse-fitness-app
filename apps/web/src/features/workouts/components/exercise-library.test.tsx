import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ExerciseLibrary } from './exercise-library';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">
        {React.isValidElement(children)
          ? React.cloneElement(
              children as React.ReactElement<{ height?: number; width?: number }>,
              {
                height: 320,
                width: 640,
              },
            )
          : children}
      </div>
    ),
  };
});

describe('ExerciseLibrary', () => {
  it('filters exercises by case-insensitive name search', () => {
    render(<ExerciseLibrary />);

    fireEvent.change(screen.getByLabelText('Search exercises'), {
      target: { value: 'ROW' },
    });

    expect(screen.getByRole('heading', { level: 3, name: 'Row Erg' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Chest-Supported Row' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Air Bike' })).not.toBeInTheDocument();
  });

  it('filters exercises by muscle group, equipment, and category together', () => {
    render(<ExerciseLibrary />);

    fireEvent.change(screen.getByLabelText('Filter by muscle group'), {
      target: { value: 'rear delts' },
    });
    fireEvent.change(screen.getByLabelText('Filter by equipment'), {
      target: { value: 'resistance band' },
    });
    fireEvent.change(screen.getByLabelText('Filter by category'), {
      target: { value: 'mobility' },
    });

    expect(
      screen.getByRole('heading', { level: 3, name: 'Banded Shoulder External Rotation' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 exercise shown')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Couch Stretch' })).not.toBeInTheDocument();
  });

  it('shows an empty state when filters remove every exercise', () => {
    render(<ExerciseLibrary />);

    fireEvent.change(screen.getByLabelText('Search exercises'), {
      target: { value: 'does not exist' },
    });

    expect(
      screen.getByText('No exercises match the current search and filter combination.'),
    ).toBeInTheDocument();
  });

  it('opens the selected exercise trend chart from the exercise name and shows empty history states', () => {
    render(<ExerciseLibrary />);

    fireEvent.click(screen.getByRole('button', { name: 'Incline Dumbbell Press' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Incline Dumbbell Press trends')).toBeInTheDocument();
    expect(screen.getByLabelText('Incline Dumbbell Press trend chart')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Air Bike' }));

    expect(screen.getByText('Air Bike trends')).toBeInTheDocument();
    expect(screen.getByText('No history yet')).toBeInTheDocument();
  });
});
