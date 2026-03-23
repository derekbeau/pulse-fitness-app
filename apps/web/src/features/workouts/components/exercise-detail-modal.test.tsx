import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
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
type ExerciseDetailModalProps = ComponentProps<typeof ExerciseDetailModal>;

function renderModal(props: ExerciseDetailModalProps) {
  return render(
    <MemoryRouter>
      <ExerciseDetailModal {...props} />
    </MemoryRouter>,
  );
}

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
    renderModal({
      context: 'template',
      exerciseId: 'incline-dumbbell-press',
      onOpenChange: vi.fn(),
      open: true,
      templateExerciseId: 'template-exercise-1',
    });

    expect(screen.getByText('Incline Dumbbell Press')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Compound')).toBeInTheDocument();
    expect(screen.getByText('Form cues')).toBeInTheDocument();
    expect(screen.getByText('Drive elbows 45 degrees')).toBeInTheDocument();
    expect(screen.getByText('Lower with control and press explosively.')).toBeInTheDocument();
    expect(screen.getByText('Keep shoulder blades tucked.')).toBeInTheDocument();
  });

  it('renders history tab with session history and trend chart', () => {
    renderModal({
      context: 'template',
      exerciseId: 'incline-dumbbell-press',
      onOpenChange: vi.fn(),
      open: true,
      templateExerciseId: 'template-exercise-1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));

    expect(screen.getByText('Mar 6, 2026 · 70x10, 70x9')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View notes' })).toBeInTheDocument();
  });

  it('renders trends tab with trend chart', () => {
    renderModal({
      context: 'template',
      exerciseId: 'incline-dumbbell-press',
      onOpenChange: vi.fn(),
      open: true,
      templateExerciseId: 'template-exercise-1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Trends' }));

    expect(screen.getByTestId('exercise-trend-chart')).toBeInTheDocument();
  });

  it('shows edit button in template context', () => {
    renderModal({
      context: 'template',
      exerciseId: 'incline-dumbbell-press',
      onOpenChange: vi.fn(),
      open: true,
      templateExerciseId: 'template-exercise-1',
    });

    expect(screen.getByRole('button', { name: 'Edit exercise' })).toBeInTheDocument();
  });

  it('shows swap button in session context and invokes swap callback', () => {
    const onOpenChange = vi.fn();
    const onSwapExercise = vi.fn();

    renderModal({
      context: 'session',
      exerciseId: 'incline-dumbbell-press',
      onOpenChange,
      onSwapExercise,
      open: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Swap exercise' }));

    expect(onSwapExercise).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows add-to-template button in library context and invokes callback', () => {
    const onAddToTemplate = vi.fn();
    const onOpenChange = vi.fn();

    renderModal({
      context: 'library',
      exerciseId: 'incline-dumbbell-press',
      onAddToTemplate,
      onOpenChange,
      open: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add to template' }));

    expect(onAddToTemplate).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows no context action buttons in receipt context', () => {
    renderModal({
      context: 'receipt',
      exerciseId: 'incline-dumbbell-press',
      onOpenChange: vi.fn(),
      open: true,
    });

    expect(screen.queryByRole('button', { name: 'Edit exercise' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Swap exercise' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to template' })).not.toBeInTheDocument();
  });

  it('defaults to history tab for session context', () => {
    renderModal({
      context: 'session',
      exerciseId: 'incline-dumbbell-press',
      onOpenChange: vi.fn(),
      open: true,
    });

    expect(screen.getByRole('tabpanel', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByText('Session history')).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel', { name: 'Overview' })).not.toBeInTheDocument();
  });

  it('renders a full workout receipt link for each history session and closes modal on click', () => {
    const onOpenChange = vi.fn();

    renderModal({
      context: 'session',
      exerciseId: 'incline-dumbbell-press',
      onOpenChange,
      open: true,
    });

    const receiptLink = screen.getByRole('link', { name: 'View full workout' });
    expect(receiptLink).toHaveAttribute('href', '/workouts/sessions/session-1');

    fireEvent.click(receiptLink);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
