import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkoutProgressionRecommendation } from '@pulse/shared';
import { describe, expect, it, vi } from 'vitest';

import { useApplyWorkoutProgressionAction, useWorkoutProgressionPreview } from '../api/progression';
import { WorkoutProgressionReview } from './workout-progression-review';

vi.mock('../api/progression', () => ({
  useApplyWorkoutProgressionAction: vi.fn(),
  useWorkoutProgressionPreview: vi.fn(),
}));
vi.mock('@/hooks/use-weight-unit', () => ({ useWeightUnit: () => ({ weightUnit: 'lbs' }) }));

const recommendation: WorkoutProgressionRecommendation = {
  confidence: 'supported',
  decision: 'increase',
  effectiveDate: '2026-08-24',
  evidence: {
    exerciseId: 'exercise-1',
    exerciseName: 'Incline press',
    performance: [
      {
        completed: true,
        distance: null,
        reps: 10,
        rpe: 8,
        seconds: null,
        setId: 'source-set-1',
        setNumber: 1,
        skipped: false,
        weight: 20,
        zone: null,
      },
    ],
    policy: {
      allowReduction: false,
      distanceStep: null,
      effortCeiling: 8,
      family: 'double_progression',
      loadIncrement: 5,
      loadIncreasePercent: null,
      lowEffortThreshold: 7,
      repRangeMax: 10,
      repRangeMin: 8,
      secondsStep: null,
      version: 1,
      zoneCeiling: null,
    },
    priorTargets: [
      {
        distance: null,
        reps: null,
        repsMax: 10,
        repsMin: 8,
        seconds: null,
        setNumber: 1,
        weight: 20,
        weightMax: null,
        weightMin: null,
        zone: null,
      },
    ],
    scheduledWorkoutDate: '2026-08-24',
    scheduledWorkoutExerciseId: 'scheduled-exercise-1',
    scheduledWorkoutId: 'scheduled-1',
    sourceSessionDate: '2026-08-20',
    sourceSessionId: 'session-1',
    trackingType: 'weight_reps',
  },
  facts: ['Every required set reached 10 reps.', 'Load increases by 5.'],
  generatedAt: 500,
  id: 'recommendation-1',
  reasonCodes: ['ALL_SETS_AT_RANGE_TOP', 'ROUNDED_TO_INCREMENT'],
  recommendedTargets: [
    {
      distance: null,
      reps: null,
      repsMax: 10,
      repsMin: 8,
      seconds: null,
      setNumber: 1,
      weight: 25,
      weightMax: null,
      weightMin: null,
      zone: null,
    },
  ],
  sourceFingerprint: 'a'.repeat(64),
  staleAt: null,
  state: 'current',
  userId: 'user-1',
};

function setup(current = recommendation) {
  const mutateAsync = vi.fn().mockResolvedValue({});
  vi.mocked(useWorkoutProgressionPreview).mockReturnValue({
    data: { recommendations: [current] },
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useWorkoutProgressionPreview>);
  vi.mocked(useApplyWorkoutProgressionAction).mockReturnValue({
    error: null,
    isError: false,
    isPending: false,
    mutateAsync,
  } as unknown as ReturnType<typeof useApplyWorkoutProgressionAction>);
  render(<WorkoutProgressionReview locked={false} scheduledWorkoutId="scheduled-1" />);
  return mutateAsync;
}

describe('WorkoutProgressionReview', () => {
  it('shows exact evidence and never applies a target merely by rendering', () => {
    const mutate = setup();
    expect(screen.getByRole('heading', { name: 'Progression review' })).toBeInTheDocument();
    expect(screen.getByText(/Current 20 lbs/)).toBeInTheDocument();
    expect(screen.getByText(/Proposed 25 lbs/)).toBeInTheDocument();
    expect(screen.getByText('Every required set reached 10 reps.')).toBeInTheDocument();
    expect(screen.getByText(/completed session 2026-08-20/)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('requires an explicit accept and preserves the server fingerprint', async () => {
    const mutate = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Accept targets' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({
      input: {
        action: 'accept',
        editedTargets: null,
        expectedFingerprint: 'a'.repeat(64),
        reason: null,
      },
      recommendationId: 'recommendation-1',
    });
  });

  it('keeps stale evidence visible but blocks every decision until recomputed', () => {
    setup({ ...recommendation, staleAt: 501, state: 'stale' });
    expect(screen.getByRole('alert')).toHaveTextContent('Recompute before making a decision');
    expect(screen.getByRole('button', { name: 'Accept targets' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep current' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hold with reason' })).toBeDisabled();
  });

  it('submits bounded edited targets while retaining the immutable recommendation', async () => {
    const mutate = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const weight = screen.getByLabelText('Weight (lbs)');
    fireEvent.change(weight, { target: { value: '22.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply edited targets' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({
      input: {
        action: 'edit',
        editedTargets: [{ setNumber: 1, weight: 22.5 }],
      },
    });
  });
});
