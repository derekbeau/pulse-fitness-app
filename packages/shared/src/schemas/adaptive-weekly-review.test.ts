import { describe, expect, it } from 'vitest';

import {
  adaptiveReviewActionInputSchema,
  adaptiveReviewContextCreateInputSchema,
  adaptiveReviewContextSchema,
  adaptiveReviewTargetProposalSchema,
  adaptiveWeeklyReviewSnapshotSchema,
} from './adaptive-weekly-review.js';

const fingerprint = 'a'.repeat(64);

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
  excludedNutrition: [{ localDate: '2026-08-16', reasonCodes: ['PARTIAL_NUTRITION_EXCLUDED'] }],
  includedWeightDates: ['2026-08-17'],
  excludedWeight: [],
  confidenceLabel: 'Moderate' as const,
  confidenceScore: 0.75,
  readinessReasonCodes: [],
};

const outcome = {
  kind: 'outcome' as const,
  title: 'Outcome' as const,
  goalType: 'maintain' as const,
  scaleWeightKg: 80,
  trendWeightKg: 79.8,
  trendChangeKg: -0.2,
  actualRateKgPerWeek: -0.18,
  desiredRateKgPerWeek: -0.25,
  etaStartDate: '2026-10-01',
  etaEndDate: '2026-10-15',
  summary: 'Trend Weight is moving toward the goal.',
  scaleNoiseExplanation: 'Scale noise is smoothed before decisions.',
};

const recommendation = {
  kind: 'recommendation' as const,
  title: 'Recommendation' as const,
  outcome: 'adjust' as const,
  headline: 'Reduce the daily target by 100 kcal',
  explanation: 'The deterministic calculation supports a bounded change.',
  currentTarget: {
    calories: 2500,
    protein: 180,
    carbs: 265,
    fat: 80,
    effectiveDate: '2026-08-01',
  },
  proposedTarget: {
    calories: 2400,
    protein: 180,
    carbs: 240,
    fat: 80,
    effectiveDate: '2026-08-19',
  },
  causalBreakdown,
};

const snapshot = {
  version: 1 as const,
  reviewLocalDate: '2026-08-19',
  analysisStart: '2026-07-30',
  analysisEnd: '2026-08-18',
  timeZone: 'America/Detroit',
  weightUnit: 'lbs',
  programId: 'program-1',
  checkInId: 'check-in-1',
  goalId: 'goal-1',
  goalRevisionId: 'revision-1',
  algorithmVersion: 'adaptive-tdee-v1',
  sourceFingerprint: fingerprint,
  headline: 'Reduce the daily target by 100 kcal',
  summary: 'Twenty complete days informed this review.',
  confidenceLabel: 'Moderate' as const,
  confidenceScore: 0.75,
  modules: [outcome, recommendation],
  contexts: [],
};

describe('adaptive weekly review schemas', () => {
  it('accepts the exact clean-week module order', () => {
    expect(
      adaptiveWeeklyReviewSnapshotSchema.parse(snapshot).modules.map((module) => module.kind),
    ).toEqual(['outcome', 'recommendation']);
  });

  it('rejects reordered, duplicate, missing, and unknown modules', () => {
    expect(() =>
      adaptiveWeeklyReviewSnapshotSchema.parse({
        ...snapshot,
        modules: [recommendation, outcome],
      }),
    ).toThrow(/deterministic display order/u);
    expect(() =>
      adaptiveWeeklyReviewSnapshotSchema.parse({ ...snapshot, modules: [outcome, outcome] }),
    ).toThrow(/unique/u);
    expect(() =>
      adaptiveWeeklyReviewSnapshotSchema.parse({ ...snapshot, modules: [recommendation] }),
    ).toThrow();
    expect(() =>
      adaptiveWeeklyReviewSnapshotSchema.parse({ ...snapshot, surprise: true }),
    ).toThrow();
  });

  it('requires a real IANA time zone and strict bounded context', () => {
    expect(
      adaptiveWeeklyReviewSnapshotSchema.parse({ ...snapshot, timeZone: 'UTC' }).timeZone,
    ).toBe('UTC');
    expect(() =>
      adaptiveWeeklyReviewSnapshotSchema.parse({ ...snapshot, timeZone: 'Not/AZone' }),
    ).toThrow(/IANA/u);
    expect(
      adaptiveReviewContextCreateInputSchema.parse({
        subject: { kind: 'date_range', startDate: '2026-08-01', endDate: '2026-08-07' },
        category: 'illness',
        note: 'Recovery was intentionally reduced.',
      }),
    ).toMatchObject({ category: 'illness' });
    expect(
      adaptiveReviewContextCreateInputSchema.parse({
        subject: { kind: 'upcoming_check_in' },
        category: 'travel',
        note: 'Use this once on the next generated cycle.',
      }).subject,
    ).toEqual({ kind: 'upcoming_check_in' });
    expect(
      adaptiveReviewContextCreateInputSchema.parse({
        subject: { kind: 'date', localDate: '2026-08-05' },
        category: 'illness',
        note: 'Low intake was intentional.',
        resolution: 'The nutrition log is complete.',
        resolutionKind: 'nutrition_complete',
      }).resolutionKind,
    ).toBe('nutrition_complete');
    expect(
      adaptiveReviewContextSchema.parse({
        id: 'pre-0050-context',
        subject: { kind: 'date', localDate: '2026-08-05' },
        category: 'illness',
        note: 'Immutable snapshot written before structured completeness resolutions.',
        resolution: 'The nutrition log was complete.',
        provenance: { type: 'user', agentTokenId: null, label: 'You' },
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      }).resolutionKind,
    ).toBeUndefined();
    expect(() =>
      adaptiveReviewContextSchema.parse({
        id: 'invalid-structured-resolution',
        subject: { kind: 'date', localDate: '2026-08-05' },
        category: 'illness',
        note: 'Structured semantics require supporting resolution text.',
        resolution: null,
        resolutionKind: 'nutrition_complete',
        provenance: { type: 'user', agentTokenId: null, label: 'You' },
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      }),
    ).toThrow(/resolution text/u);
    expect(() =>
      adaptiveReviewContextCreateInputSchema.parse({
        subject: { kind: 'date', localDate: '2026-08-05' },
        category: 'illness',
        note: 'Missing resolution text.',
        resolutionKind: 'nutrition_complete',
      }),
    ).toThrow(/resolution text/u);
    expect(() =>
      adaptiveReviewContextSchema.parse({
        id: 'context-1',
        subject: { kind: 'upcoming_check_in' },
        category: 'travel',
        note: 'Missing the server-owned target cycle.',
        resolution: null,
        provenance: { type: 'user', agentTokenId: null, label: 'You' },
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      }),
    ).toThrow();
    expect(() =>
      adaptiveReviewContextCreateInputSchema.parse({
        subject: { kind: 'date_range', startDate: '2026-08-07', endDate: '2026-08-01' },
        category: 'illness',
        note: 'Invalid range.',
      }),
    ).toThrow(/startDate/u);
  });

  it('rejects macros that do not reconcile and unbounded edits', () => {
    expect(adaptiveReviewTargetProposalSchema.parse(recommendation.proposedTarget)).toEqual(
      recommendation.proposedTarget,
    );
    expect(() =>
      adaptiveReviewTargetProposalSchema.parse({
        ...recommendation.proposedTarget,
        calories: 1200,
      }),
    ).toThrow(/Macro calories/u);
  });

  it('keeps material and agent-safe actions distinct and strict', () => {
    expect(
      adaptiveReviewActionInputSchema.parse({
        type: 'accept',
        expectedFingerprint: fingerprint,
        expectedActionSequence: 0,
      }),
    ).toMatchObject({ type: 'accept' });
    expect(
      adaptiveReviewActionInputSchema.parse({
        type: 'ask_agent',
        expectedActionSequence: 2,
        question: 'Was the low day already explained?',
      }),
    ).toMatchObject({ type: 'ask_agent' });
    expect(() =>
      adaptiveReviewActionInputSchema.parse({
        type: 'ask_agent',
        expectedActionSequence: 2,
        question: 'Question',
        calories: 1200,
      }),
    ).toThrow();
  });
});
