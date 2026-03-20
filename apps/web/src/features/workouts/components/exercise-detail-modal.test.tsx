import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useExerciseHistory } from '@/hooks/use-exercise-history';

import { useExercise } from '../api/workouts';
import { ExerciseDetailModal } from './exercise-detail-modal';

vi.mock('../api/workouts', () => ({
  useExercise: vi.fn(),
}));

vi.mock('@/hooks/use-exercise-history', () => ({
  useExerciseHistory: vi.fn(),
}));

vi.mock('@/hooks/use-weight-unit', () => ({
  useWeightUnit: () => ({ weightUnit: 'lbs' }),
}));

vi.mock('./exercise-trend-chart', () => ({
  ExerciseTrendChart: () => <div data-testid="exercise-trend-chart" />,
}));

const useExerciseMock = vi.mocked(useExercise);
const useExerciseHistoryMock = vi.mocked(useExerciseHistory);

function setup() {
  useExerciseMock.mockReturnValue({
    data: {
      category: 'compound',
      coachingNotes: 'Keep shoulder blades tucked.',
      equipment: 'dumbbells',
      formCues: ['Drive elbows 45 degrees', 'Control the eccentric'],
      id: 'incline-dumbbell-press',
      instructions: 'Lower with control and press explosively.',
      muscleGroups: ['upper chest', 'triceps'],
      name: 'Incline Dumbbell Press',
      tags: [],
      trackingType: 'weight_reps',
      userId: 'user-1',
      createdAt: 1,
      updatedAt: 1,
    },
    isPending: false,
  } as unknown as ReturnType<typeof useExercise>);

  useExerciseHistoryMock.mockReturnValue({
    data: [
      {
        date: '2026-03-06',
        notes: 'Felt strong.',
        sessionId: 'session-1',
        sets: [
          { reps: 10, setNumber: 1, weight: 70 },
          { reps: 9, setNumber: 2, weight: 70 },
        ],
      },
    ],
    isPending: false,
  } as unknown as ReturnType<typeof useExerciseHistory>);
}

describe('ExerciseDetailModal', () => {
  beforeEach(() => {
    setup();
  });

  it('renders overview tab with exercise details', () => {
    render(
      <ExerciseDetailModal
        context="template"
        exerciseId="incline-dumbbell-press"
        onOpenChange={vi.fn()}
        open
        templateExerciseId="template-exercise-1"
      />,
    );

    expect(screen.getByText('Incline Dumbbell Press')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Compound')).toBeInTheDocument();
    expect(screen.getByText('Form cues')).toBeInTheDocument();
    expect(screen.getByText('Drive elbows 45 degrees')).toBeInTheDocument();
    expect(screen.getByText('Lower with control and press explosively.')).toBeInTheDocument();
    expect(screen.getByText('Keep shoulder blades tucked.')).toBeInTheDocument();
  });

  it('renders history tab with session history and trend chart', () => {
    render(
      <ExerciseDetailModal
        context="template"
        exerciseId="incline-dumbbell-press"
        onOpenChange={vi.fn()}
        open
        templateExerciseId="template-exercise-1"
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));

    expect(screen.getByTestId('exercise-trend-chart')).toBeInTheDocument();
    expect(screen.getByText('Mar 6, 2026 · 70x10, 70x9')).toBeInTheDocument();
    expect(screen.getByText('Notes: Felt strong.')).toBeInTheDocument();
  });

  it('shows edit button in template context', () => {
    render(
      <ExerciseDetailModal
        context="template"
        exerciseId="incline-dumbbell-press"
        onOpenChange={vi.fn()}
        open
        templateExerciseId="template-exercise-1"
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit exercise' })).toBeInTheDocument();
  });

  it('shows swap button in session context and invokes swap callback', () => {
    const onOpenChange = vi.fn();
    const onSwapExercise = vi.fn();

    render(
      <ExerciseDetailModal
        context="session"
        exerciseId="incline-dumbbell-press"
        onOpenChange={onOpenChange}
        onSwapExercise={onSwapExercise}
        open
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Swap exercise' }));

    expect(onSwapExercise).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows add-to-template button in library context and invokes callback', () => {
    const onAddToTemplate = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ExerciseDetailModal
        context="library"
        exerciseId="incline-dumbbell-press"
        onAddToTemplate={onAddToTemplate}
        onOpenChange={onOpenChange}
        open
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to template' }));

    expect(onAddToTemplate).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows no context action buttons in receipt context', () => {
    render(
      <ExerciseDetailModal
        context="receipt"
        exerciseId="incline-dumbbell-press"
        onOpenChange={vi.fn()}
        open
      />,
    );

    expect(screen.queryByRole('button', { name: 'Edit exercise' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Swap exercise' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to template' })).not.toBeInTheDocument();
  });
});
