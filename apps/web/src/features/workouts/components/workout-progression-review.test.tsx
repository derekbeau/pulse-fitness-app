import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
        rir: null,
        effortSource: 'native_rpe',
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
    priority: true,
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
      'Set 120 lbs · 8–10 repsSource session set: source-set-1; scheduled source: source-scheduled-set-120 lbs · 10 reps · RPE 820 lbs · 8–10 repsCurrent scheduled set: scheduled-set-125 lbs · 8–10 reps',
    );
    expect(screen.getByText('Every required set reached 10 reps.')).toBeInTheDocument();
    expect(screen.getByText(/completed session 2026-08-20/)).toBeInTheDocument();
    expect(screen.getByText(/Policy source:/i)).toHaveTextContent(
      'You · revision 1 · priority exercise',
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows compatibility provenance and raw values for legacy evidence', () => {
    setup({
      ...recommendation,
      evidence: {
        ...recommendation.evidence,
        diagnostics: [
          {
            reason: 'REDUNDANT_EXACT_REPS',
            raw: { reps: 8, repsMin: 8, repsMax: 8 },
            setId: 'scheduled-set-1',
            setNumber: 1,
            source: 'current_scheduled_target',
          },
        ],
      },
    });

    expect(screen.getByLabelText('Incline press evidence diagnostics')).toHaveTextContent(
      'Legacy exact-reps bounds were normalized for evaluation in the current scheduled target (set 1).',
    );
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

  it('discloses unavailable historical priority without erasing policy provenance', () => {
    setup({
      ...recommendation,
      evidence: { ...recommendation.evidence, priority: null },
      state: 'stale',
    });

    expect(screen.getByText(/Policy source:/i)).toHaveTextContent(
      'You · revision 1 · historical priority unavailable',
    );
  });

  it('disables target changes when policy evidence is unavailable', () => {
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
    expect(screen.getByRole('status')).toHaveTextContent(
      'No progression policy is configured for this exercise. The current plan has not changed.',
    );
  });

  it('shows no-history and server failures inline without a global retry loop', () => {
    vi.mocked(useWorkoutProgressionPreview).mockReturnValue({
      data: {
        recommendations: [
          {
            ...recommendation,
            confidence: 'unavailable',
            decision: 'hold',
            reasonCodes: ['NO_COMPLETED_HISTORY'],
            facts: ['No completed performance exists for this exercise.'],
          },
        ],
      },
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkoutProgressionPreview>);
    vi.mocked(useApplyWorkoutProgressionAction).mockReturnValue({
      error: null,
      isError: false,
      isPending: false,
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useApplyWorkoutProgressionAction>);
    const { unmount } = render(
      <WorkoutProgressionReview locked={false} scheduledWorkoutId="scheduled-1" />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'No completed matching history is available yet. The current plan has not changed.',
    );
    unmount();

    const retry = vi.fn();
    vi.mocked(useWorkoutProgressionPreview).mockReturnValue({
      data: undefined,
      isError: true,
      isFetching: false,
      isLoading: false,
      refetch: retry,
    } as unknown as ReturnType<typeof useWorkoutProgressionPreview>);
    render(<WorkoutProgressionReview locked={false} scheduledWorkoutId="scheduled-1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your plan has not changed.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('retains invalid historical prescription and completed observations in the comparison', () => {
    setup();
    cleanup();
    vi.mocked(useWorkoutProgressionPreview).mockReturnValue({
      data: {
        recommendations: [
          {
            ...recommendation,
            confidence: 'unavailable',
            decision: 'hold',
            reasonCodes: ['INVALID_HISTORICAL_PRESCRIPTION'],
            evidence: {
              ...recommendation.evidence,
              performance: [],
              diagnostics: [
                {
                  reason: 'INVALID_HISTORICAL_PRESCRIPTION',
                  source: 'historical_prescribed_target',
                  setId: 'source-set-1',
                  setNumber: 1,
                  raw: { reps: 8, repsMin: 6, repsMax: 8 },
                  observed: { weight: 20, reps: 10, completed: 'true' },
                },
              ],
            },
          },
        ],
      },
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkoutProgressionPreview>);
    render(<WorkoutProgressionReview locked={false} scheduledWorkoutId="scheduled-1" />);
    const table = screen.getByRole('table');
    expect(within(table).getByText(/Invalid historical prescribed target/)).toHaveTextContent(
      'repsMin=6',
    );
    expect(within(table).getByText(/weight=20/)).toHaveTextContent('reps=10');
    expect(screen.getByRole('button', { name: 'Accept targets' })).toBeDisabled();
  });

  it('shows exactly one disabled retry while a retry is pending', () => {
    setup();
    cleanup();
    const refetch = vi.fn();
    vi.mocked(useWorkoutProgressionPreview).mockReturnValue({
      data: undefined,
      isError: true,
      isFetching: true,
      isLoading: false,
      refetch,
    } as unknown as ReturnType<typeof useWorkoutProgressionPreview>);
    render(<WorkoutProgressionReview locked={false} scheduledWorkoutId="scheduled-1" />);
    expect(
      screen.queryByRole('button', { name: 'Recompute workout progression' }),
    ).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Retrying…' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('preserves previous and current source identities in same-number comparisons', () => {
    setup();
    expect(
      screen.getByText(
        'Source session set: source-set-1; scheduled source: source-scheduled-set-1',
      ),
    ).toBeVisible();
    expect(screen.getByText('Current scheduled set: scheduled-set-1')).toBeVisible();
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
