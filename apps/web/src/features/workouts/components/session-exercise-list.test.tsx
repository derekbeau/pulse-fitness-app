import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { mockTemplates } from '@/lib/mock-data/workouts';

import { buildActiveWorkoutSession, createWorkoutSetId } from '../lib/active-session';
import { SessionExerciseList } from './session-exercise-list';

const activeTemplate = mockTemplates.find((template) => template.id === 'upper-push');

describe('SessionExerciseList', () => {
  it('shows section completion status and auto-expands the current exercise', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const session = buildActiveWorkoutSession(
      activeTemplate,
      new Set([
        createWorkoutSetId('row-erg', 1),
        createWorkoutSetId('banded-shoulder-external-rotation', 1),
        createWorkoutSetId('banded-shoulder-external-rotation', 2),
        createWorkoutSetId('incline-dumbbell-press', 1),
        createWorkoutSetId('incline-dumbbell-press', 2),
      ]),
    );

    render(<SessionExerciseList session={session} />);

    expect(screen.getByText('Warmup (2/2 exercises done)')).toBeInTheDocument();
    expect(screen.getByText('Main (0/4 exercises done)')).toBeInTheDocument();
    expect(screen.getByLabelText('In-progress exercise')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Upcoming exercise').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Warmup/i }));

    expect(screen.getAllByLabelText('Completed exercise').length).toBe(2);

    const currentExercise = screen.getByRole('heading', {
      level: 3,
      name: 'Incline Dumbbell Press',
    });
    const currentCard = currentExercise.closest('[data-slot="card"]');

    expect(currentCard).not.toBeNull();
    expect(within(currentCard as HTMLElement).getByText('Current')).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getByText('Set 1')).toBeInTheDocument();
    expect(within(currentCard as HTMLElement).getByText('Set 3')).toBeInTheDocument();
  });

  it('collapses sections and toggles exercise details on click', () => {
    if (!activeTemplate) {
      throw new Error('Expected upper-push template in mock data.');
    }

    const session = buildActiveWorkoutSession(activeTemplate, new Set());

    render(<SessionExerciseList session={session} />);

    const warmupButton = screen.getByRole('button', { name: /Warmup/i });

    expect(screen.getByRole('heading', { level: 3, name: 'Row Erg' })).toBeInTheDocument();

    fireEvent.click(warmupButton);

    expect(screen.queryByRole('heading', { level: 3, name: 'Row Erg' })).not.toBeInTheDocument();

    fireEvent.click(warmupButton);

    const exerciseButton = screen.getByRole('button', { name: /Row Erg/i });

    expect(screen.getByText('Set 1')).toBeInTheDocument();

    fireEvent.click(exerciseButton);

    expect(screen.queryByText('Set 1')).not.toBeInTheDocument();
  });
});
