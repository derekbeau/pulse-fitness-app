import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdaptiveWeeklyReview } from '@pulse/shared';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { WeeklyDecisionBrief, WeeklyReviewEvidence } from './weekly-decision-review';

const target = {
  calories: 2500,
  protein: 180,
  carbs: 265,
  fat: 80,
  effectiveDate: '2026-08-01',
};

const causalBreakdown = {
  priorExpenditureKcal: 2500,
  observedExpenditureKcal: 2550,
  proposedExpenditureKcal: 2525,
  observedTrendContributionKcal: 50,
  goalRateContributionKcal: -250,
  requestedAdjustmentKcal: 50,
  appliedAdjustmentKcal: 25,
  smoothingOrCapKcal: -25,
  safetyFloorKcal: 1500,
  deficitLimitKcal: 1025,
  includedNutritionDates: ['2026-08-17'],
  excludedNutrition: [],
  includedWeightDates: ['2026-08-17'],
  excludedWeight: [],
  confidenceLabel: 'Moderate' as const,
  confidenceScore: 0.75,
  readinessReasonCodes: [],
};

const outcomeModule = {
  kind: 'outcome' as const,
  title: 'Outcome' as const,
  goalType: 'lose' as const,
  scaleWeightKg: 80,
  trendWeightKg: 79.8,
  trendChangeKg: -0.2,
  actualRateKgPerWeek: -0.18,
  desiredRateKgPerWeek: -0.25,
  etaStartDate: '2026-10-01',
  etaEndDate: '2026-10-15',
  summary: 'Trend Weight is moving toward the goal.',
  scaleNoiseExplanation: 'Daily scale noise is smoothed before decisions.',
};

const recommendationModule = {
  kind: 'recommendation' as const,
  title: 'Recommendation' as const,
  outcome: 'adjust' as const,
  headline: 'Reduce the daily target by 100 kcal',
  explanation: 'The deterministic calculation supports a bounded change.',
  currentTarget: target,
  proposedTarget: {
    calories: 2400,
    protein: 180,
    carbs: 240,
    fat: 80,
    effectiveDate: '2026-08-19',
  },
  causalBreakdown,
};

const review = {
  id: 'review-1',
  checkInId: 'check-in-1',
  sourceFingerprint: 'b'.repeat(64),
  snapshot: {
    version: 1 as const,
    reviewLocalDate: '2026-08-19',
    analysisStart: '2026-07-30',
    analysisEnd: '2026-08-18',
    timeZone: 'America/Detroit',
    weightUnit: 'lbs' as const,
    programId: 'program-1',
    checkInId: 'check-in-1',
    goalId: 'goal-1',
    goalRevisionId: 'revision-1',
    algorithmVersion: 'adaptive-tdee-v1',
    sourceFingerprint: 'b'.repeat(64),
    headline: recommendationModule.headline,
    summary: 'Twenty complete nutrition days and four weigh-ins informed this review.',
    confidenceLabel: 'Moderate' as const,
    confidenceScore: 0.75,
    modules: [outcomeModule, recommendationModule],
    contexts: [],
  },
  state: 'pending' as const,
  actionSequence: 0,
  actions: [],
  effectiveProposal: recommendationModule.proposedTarget,
  deferCondition: null,
  availableActions: ['accept', 'edit', 'defer', 'decline', 'ask_agent'] as const,
  createdAt: 1_787_155_200_000,
} satisfies AdaptiveWeeklyReview;

describe('WeeklyDecisionBrief', () => {
  it('puts the fast decision, transparency, targets, and explicit consent first', () => {
    render(
      <MemoryRouter>
        <WeeklyDecisionBrief isPending={false} onAction={vi.fn()} review={review} />
      </MemoryRouter>,
    );

    const article = screen.getByRole('article', { name: recommendationModule.headline });
    expect(within(article).getByText('What changed')).toBeInTheDocument();
    expect(within(article).getByText(recommendationModule.headline)).toBeInTheDocument();
    expect(within(article).getByText('Moderate · 75%')).toBeInTheDocument();
    expect(within(article).getByRole('button', { name: 'Accept and apply targets' })).toBeEnabled();
    expect(within(article).getByRole('link', { name: /review all evidence/i })).toHaveAttribute(
      'href',
      '/nutrition/reviews/review-1',
    );
    expect(within(article).getByText(/-100/)).toBeInTheDocument();
  });

  it('records accept only after explicit activation', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <WeeklyDecisionBrief isPending={false} onAction={onAction} review={review} />
      </MemoryRouter>,
    );
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Accept and apply targets' }));
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith({
        type: 'accept',
        expectedFingerprint: review.sourceFingerprint,
        expectedActionSequence: 0,
      }),
    );
  });

  it('opens the bounded agent question dialog by keyboard and restores focus', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <WeeklyDecisionBrief isPending={false} onAction={onAction} review={review} />
      </MemoryRouter>,
    );
    const trigger = screen.getByRole('button', { name: 'Ask your agent' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/not a live chat/i)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('requires confirmation before decline and preserves semantic focus controls', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <WeeklyDecisionBrief isPending={false} onAction={onAction} review={review} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Decline recommendation' }));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Decline and keep current' }));
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'decline', expectedActionSequence: 0 }),
      ),
    );
  });

  it('blocks stale controls and refreshes through the explicit server operation', async () => {
    const onAction = vi
      .fn()
      .mockRejectedValue(new ApiError(409, 'Source evidence changed', 'ADAPTIVE_REVIEW_STALE'));
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <WeeklyDecisionBrief
          isPending={false}
          onAction={onAction}
          onRefresh={onRefresh}
          review={review}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Accept and apply targets' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Edit proposal' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh review' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('requires an explicit second confirmation before replacing a same-date target', async () => {
    const onAction = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(409, 'A target already exists for this date', 'SAME_DATE_TARGET_EXISTS'),
      )
      .mockResolvedValueOnce(undefined);
    render(
      <MemoryRouter>
        <WeeklyDecisionBrief isPending={false} onAction={onAction} review={review} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept and apply targets' }));
    expect(await screen.findByRole('button', { name: 'Replace today’s target' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit proposal' })).toBeDisabled();
    expect(onAction).toHaveBeenNthCalledWith(1, {
      type: 'accept',
      expectedFingerprint: review.sourceFingerprint,
      expectedActionSequence: review.actionSequence,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Replace today’s target' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    expect(onAction).toHaveBeenNthCalledWith(2, {
      type: 'accept',
      expectedFingerprint: review.sourceFingerprint,
      expectedActionSequence: review.actionSequence,
      replaceSameDateTarget: true,
    });
  });

  it('defaults defer to the next program-local date and preserves date submission', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <WeeklyDecisionBrief isPending={false} onAction={onAction} review={review} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Defer review' }));
    expect(screen.getByLabelText('Return on')).toHaveValue('2026-08-20');
    expect(screen.getByLabelText('Return on')).toHaveAttribute('min', '2026-08-20');
    fireEvent.click(screen.getByRole('button', { name: 'Defer without changing plan' }));
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith({
        type: 'defer',
        expectedFingerprint: review.sourceFingerprint,
        expectedActionSequence: review.actionSequence,
        condition: { kind: 'until_date', localDate: '2026-08-20' },
        reason: 'Wait for the next planned evidence point.',
      }),
    );
  });

  it('defers until user-selected evidence with accessible validation and one in-flight action', async () => {
    let resolveAction: (() => void) | undefined;
    const onAction = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <WeeklyDecisionBrief isPending={false} onAction={onAction} review={review} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Defer review' }));
    fireEvent.click(screen.getByLabelText('When evidence arrives'));

    const submit = screen.getByRole('button', { name: 'Defer without changing plan' });
    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose the evidence that should return this review.',
    );
    expect(screen.getByRole('radiogroup', { name: 'Evidence trigger' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(onAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Next weigh-in'));
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith({
      type: 'defer',
      expectedFingerprint: review.sourceFingerprint,
      expectedActionSequence: review.actionSequence,
      condition: {
        kind: 'until_evidence',
        evidence: 'next_weigh_in',
        baselineFingerprint: review.sourceFingerprint,
      },
      reason: 'Wait for the next planned evidence point.',
    });
    expect(screen.getByRole('button', { name: 'Deferring review…' })).toBeDisabled();
    expect(screen.getByLabelText('When evidence arrives')).toBeDisabled();

    resolveAction?.();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps a failed edit dialog open and prevents duplicate in-flight submits', async () => {
    let rejectAction: ((reason?: unknown) => void) | undefined;
    const onAction = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectAction = reject;
        }),
    );
    render(
      <MemoryRouter>
        <WeeklyDecisionBrief isPending={false} onAction={onAction} review={review} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit proposal' }));
    const submit = screen.getByRole('button', { name: 'Save edited proposal' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(onAction).toHaveBeenCalledOnce();
    rejectAction?.(new ApiError(500, 'Save failed', 'INTERNAL_ERROR'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Calories')).toHaveValue(review.effectiveProposal?.calories);
  });

  it('blocks decisions and offers refresh when the server projects stale state', () => {
    render(
      <MemoryRouter>
        <WeeklyDecisionBrief
          isPending={false}
          onAction={vi.fn()}
          onRefresh={vi.fn()}
          review={{ ...review, state: 'stale', availableActions: [] }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Accept and apply targets' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh review' })).toBeEnabled();
  });
});

describe('WeeklyReviewEvidence', () => {
  it('renders non-empty decision history in the review program time zone', () => {
    const withHistory: AdaptiveWeeklyReview = {
      ...review,
      actions: [
        {
          id: 'action-1',
          sequence: 1,
          type: 'ask_agent',
          payload: { question: 'What changed?' },
          actor: { type: 'agent_token', agentTokenId: 'agent-1', label: 'Coach' },
          createdAt: Date.parse('2026-08-19T12:30:00.000Z'),
        },
      ],
    };

    render(
      <MemoryRouter>
        <WeeklyReviewEvidence review={withHistory} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Coach · Aug 19, 2026, 8:30 AM EDT')).toBeVisible();
    expect(screen.getByText('What changed?')).toBeVisible();
  });

  it('renders server-selected modules in deterministic order with cutoff and recovery truth', () => {
    const maximal: AdaptiveWeeklyReview = {
      ...review,
      snapshot: {
        ...review.snapshot,
        contexts: [
          {
            id: 'context-1',
            subject: { kind: 'date', localDate: '2026-08-18' },
            category: 'illness',
            note: 'Illness already explains the rest day.',
            resolution: 'No redundant question needed.',
            resolutionKind: null,
            provenance: { type: 'agent_token', agentTokenId: 'agent-1', label: 'Coach' },
            revision: 1,
            createdAt: review.createdAt,
            updatedAt: review.createdAt,
            deletedAt: null,
          },
        ],
        modules: [
          {
            kind: 'data_quality',
            title: 'Data quality',
            summary: 'Pending and excluded records stay visible.',
            evidence: [
              {
                kind: 'weigh_in',
                id: 'weight-today',
                localDate: '2026-08-19',
                state: 'pending_cutoff',
                label: 'Weigh-in logged after the completed-day cutoff',
                detail: 'Logged today and pending, never treated as missing.',
                reasonCodes: ['WEIGH_IN_PENDING_COMPLETED_DAY_CUTOFF'],
                resolution: null,
              },
            ],
            requiresClarification: false,
            resolutionOptions: ['add_context'],
          },
          outcomeModule,
          {
            kind: 'energy',
            title: 'Energy',
            state: 'updating',
            averageIntakeKcal: 2400,
            averageTargetKcal: 2500,
            averageExpenditureKcal: 2550,
            intakeMinusTargetKcal: -100,
            intakeMinusExpenditureKcal: -150,
            completeDays: 18,
            summary: 'Complete days support the estimate.',
            sourceCheckInIds: ['accepted-1'],
          },
          {
            kind: 'training_recovery',
            title: 'Training and recovery',
            scheduledCount: 4,
            completedCount: 3,
            movedCount: 1,
            skippedCount: 0,
            averageRpe: 7,
            averageEnergy: 3,
            averageRecovery: 2,
            performanceTrend: 'steady',
            painOrIllnessPresent: true,
            summary: 'Training facts did not alter nutrition.',
            evidence: [
              {
                kind: 'annotation',
                id: 'context-1',
                localDate: '2026-08-18',
                state: 'logged',
                label: 'Illness',
                detail: 'Illness already explains the rest day.',
                reasonCodes: ['CONTEXT_RECORDED'],
                resolution: 'No redundant question needed.',
              },
            ],
            nutritionCausalRuleApplied: false,
          },
          recommendationModule,
        ],
      },
    };
    render(
      <MemoryRouter>
        <WeeklyReviewEvidence review={maximal} />
      </MemoryRouter>,
    );

    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual([
      recommendationModule.headline,
      'Data quality',
      'Outcome',
      'Energy',
      'Training and recovery',
      'Recommendation',
      'Context records',
      'Decision history',
    ]);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(
      screen.getByText(/logged today and pending, never treated as missing/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Nutrition causal rule: not applied')).toBeInTheDocument();
    expect(screen.getByText('Resolution: No redundant question needed.')).toBeInTheDocument();
    expect(screen.getByText('−100 kcal')).toBeInTheDocument();
    expect(screen.getByText('−150 kcal')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Structured causal breakdown'));
    expect(screen.getByText('Trend-rate energy contribution')).toBeVisible();
    expect(screen.getByText('Goal-rate contribution')).toBeVisible();
    expect(screen.getByText('Smoothing / cap effect')).toBeVisible();
    expect(screen.getByText('Loss deficit guardrail')).toBeVisible();
    expect(screen.getByText('Included nutrition dates')).toBeVisible();
    expect(screen.getByText('Excluded nutrition')).toBeVisible();
    expect(screen.getByText('Included weigh-in dates')).toBeVisible();
    expect(screen.getByText('Readiness reasons')).toBeVisible();
  });

  it('does not mutate merely by opening evidence disclosures', () => {
    const onAction = vi.fn();
    render(
      <MemoryRouter>
        <WeeklyReviewEvidence review={review} />
      </MemoryRouter>,
    );
    const disclosure = screen.getByText('Structured causal breakdown');
    fireEvent.click(disclosure);
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText('Prior expenditure')).toBeVisible();
  });
});
