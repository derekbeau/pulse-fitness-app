import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
        sourceScheduledSetId: 'source-scheduled-set-1',
        setNumber: 1,
        skipped: false,
        weight: 20,
        zone: null,
        prescribed: {
          distance: null,
          reps: null,
          repsMax: 10,
          repsMin: 8,
          seconds: null,
          setId: 'source-set-1',
          setNumber: 1,
          weight: 20,
          weightMax: null,
          weightMin: null,
          zone: null,
        },
      },
    ],
    policy: {
      allowReduction: false,
      contextRequired: false,
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
    context: { availability: 'available', facts: [] },
    policySource: {
      actorId: 'user-1',
      actorLabel: 'You',
      actorType: 'user',
      configurationId: 'configuration-1',
      configuredAt: 450,
      revision: 1,
      type: 'programming_config',
    },
    priorTargets: [
      {
        distance: null,
        reps: null,
        repsMax: 10,
        repsMin: 8,
        seconds: null,
        setId: 'scheduled-set-1',
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
      setId: 'scheduled-set-1',
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
    const comparison = screen.getByRole('table', {
      name: 'Incline press exact progression comparison',
    });
    expect(
      within(comparison).getByRole('columnheader', { name: 'Previous prescription' }),
    ).toBeInTheDocument();
    expect(
      within(comparison).getByRole('columnheader', { name: 'Completed performance' }),
    ).toBeInTheDocument();
    expect(
      within(comparison).getByRole('columnheader', { name: 'Current plan' }),
    ).toBeInTheDocument();
    expect(
      within(comparison).getByRole('columnheader', { name: 'Proposed target' }),
    ).toBeInTheDocument();
    expect(within(comparison).getByRole('row', { name: /Set 1/ })).toHaveTextContent(
      'Set 120 lbs · 8–10 reps20 lbs · 10 reps · RPE 820 lbs · 8–10 reps25 lbs · 8–10 reps',
    );
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

  it('keeps removed historical source sets visible in the exact comparison', () => {
    const sourceSet = recommendation.evidence.performance[0];
    setup({
      ...recommendation,
      evidence: {
        ...recommendation.evidence,
        performance: [
          sourceSet,
          {
            ...sourceSet,
            prescribed: { ...sourceSet.prescribed, setId: 'source-set-2', setNumber: 2 },
            setId: 'source-set-2',
            setNumber: 2,
            sourceScheduledSetId: 'source-scheduled-set-2',
          },
        ],
      },
    });

    expect(
      screen.getByRole('row', { name: /Set 2.*No current set.*Not available/i }),
    ).toHaveTextContent('20 lbs · 8–10 reps');
  });

  it('keeps stale evidence visible but blocks every decision until recomputed', () => {
    setup({ ...recommendation, staleAt: 501, state: 'stale' });
    expect(screen.getByRole('alert')).toHaveTextContent('Recompute before making a decision');
    expect(screen.getByRole('button', { name: 'Accept targets' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep current' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hold with reason' })).toBeDisabled();
  });

  it('does not offer target application when policy evidence is unavailable', () => {
    setup({
      ...recommendation,
      confidence: 'unavailable',
      decision: 'hold',
      evidence: {
        ...recommendation.evidence,
        policy: {
          ...recommendation.evidence.policy,
          family: 'unsupported',
          loadIncrement: null,
        },
        policySource: {
          actorId: null,
          actorLabel: null,
          actorType: null,
          configurationId: null,
          configuredAt: null,
          revision: 0,
          type: 'none',
        },
      },
      reasonCodes: ['MISSING_POLICY'],
      recommendedTargets: recommendation.evidence.priorTargets,
    });
    expect(screen.getByRole('button', { name: 'Accept targets' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep current' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Hold with reason' })).toBeEnabled();
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
