import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExerciseLibrary } from './exercise-library';

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
});
