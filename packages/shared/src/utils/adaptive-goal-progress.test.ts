import { describe, expect, it } from 'vitest';

import type { AdaptiveGoal, AdaptiveGoalRevision } from '../schemas/adaptive-nutrition.js';
import {
  ADAPTIVE_GOAL_PROGRESS_CONSTANTS,
  calculateAdaptiveGoalProgress,
} from './adaptive-goal-progress.js';

const goal = (overrides: Partial<AdaptiveGoal> = {}): AdaptiveGoal => ({
  id: 'goal-1',
  userId: 'user-1',
  programId: 'program-1',
  type: 'lose',
  status: 'active',
  startTrendWeightKg: 100,
  startScaleWeightKg: 100.5,
  targetWeightKg: 90,
  maintenanceCenterKg: null,
  goalRatePctPerWeek: -0.5,
  startedLocalDate: '2026-01-01',
  endedLocalDate: null,
  endedReason: null,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const revision = (overrides: Partial<AdaptiveGoalRevision> = {}): AdaptiveGoalRevision => ({
  id: 'revision-1',
  goalId: 'goal-1',
  userId: 'user-1',
  sequence: 1,
  targetWeightKg: 90,
  maintenanceCenterKg: null,
  goalRatePctPerWeek: -0.5,
  previousTargetWeightKg: 90,
  previousCenterKg: null,
  previousRatePctPerWeek: -0.5,
  reason: 'created',
  effectiveLocalDate: '2026-01-01',
  createdAt: 1,
  ...overrides,
});

const points = (...weights: number[]) =>
  weights.map((trendWeightKg, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    trendWeightKg,
  }));

describe('calculateAdaptiveGoalProgress', () => {
  it('calculates loss progress, clamps both ends, and never decreases toward the goal', () => {
    const before = calculateAdaptiveGoalProgress({
      goal: goal(),
      revision: revision(),
      currentLocalDate: '2026-01-21',
      currentTrendWeightKg: 101,
      latestScaleWeightKg: 100.8,
      latestWeightAgeDays: 0,
      confidence: 'High',
      trendPoints: points(101.2, 101.1, 101),
    });
    const middle = calculateAdaptiveGoalProgress({
      goal: goal(),
      revision: revision(),
      currentLocalDate: '2026-01-21',
      currentTrendWeightKg: 95,
      latestScaleWeightKg: 94.8,
      latestWeightAgeDays: 0,
      confidence: 'High',
      trendPoints: points(95.2, 95.1, 95),
    });
    const beyond = calculateAdaptiveGoalProgress({
      goal: goal(),
      revision: revision(),
      currentLocalDate: '2026-01-21',
      currentTrendWeightKg: 89,
      latestScaleWeightKg: 89.2,
      latestWeightAgeDays: 0,
      confidence: 'High',
      trendPoints: points(89.2, 89.1, 89),
    });
    expect(before.kind).toBe('weight_change');
    expect(middle.kind).toBe('weight_change');
    expect(beyond.kind).toBe('weight_change');
    if (
      before.kind !== 'weight_change' ||
      middle.kind !== 'weight_change' ||
      beyond.kind !== 'weight_change'
    )
      return;
    expect(before.completedDistanceKg).toBe(0);
    expect(middle.completedDistanceKg).toBe(5);
    expect(middle.percentComplete).toBe(50);
    expect(beyond.completedDistanceKg).toBe(10);
    expect(beyond.remainingDistanceKg).toBe(0);
    expect(beyond.percentComplete).toBe(100);
    expect(beyond.status).toBe('reached');
  });

  it('calculates gain direction and desired/actual date ranges deterministically', () => {
    const result = calculateAdaptiveGoalProgress({
      goal: goal({
        type: 'gain',
        targetWeightKg: 105,
        goalRatePctPerWeek: 0.25,
      }),
      revision: revision({
        targetWeightKg: 105,
        goalRatePctPerWeek: 0.25,
        previousTargetWeightKg: 105,
        previousRatePctPerWeek: 0.25,
      }),
      currentLocalDate: '2026-02-01',
      currentTrendWeightKg: 102,
      latestScaleWeightKg: 102.2,
      latestWeightAgeDays: 1,
      confidence: 'Moderate',
      trendPoints: points(101.7, 101.8, 101.9, 102),
    });
    expect(result.kind).toBe('weight_change');
    if (result.kind !== 'weight_change') return;
    expect(result.completedDistanceKg).toBe(2);
    expect(result.trajectory).toBe('toward_goal');
    expect(result.desiredProjection.weeks).toBeGreaterThan(0);
    expect(result.desiredProjection.projectedStartDate).not.toBeNull();
    expect(result.actualProjection.weeks).toBeGreaterThan(0);
    expect(result.actualProjection.projectedEndDate).not.toBeNull();
  });

  it('reports every actual-projection unavailable reason without false precision', () => {
    const base = {
      goal: goal(),
      revision: revision(),
      currentLocalDate: '2026-02-01',
      currentTrendWeightKg: 97,
      latestScaleWeightKg: 97.2,
      latestWeightAgeDays: 0,
      confidence: 'High' as const,
    };
    const cases = [
      { trendPoints: points(97), reason: 'INSUFFICIENT_TREND' },
      { trendPoints: points(97.2, 97.1, 97), latestWeightAgeDays: 8, reason: 'STALE_WEIGHT' },
      { trendPoints: points(96.8, 96.9, 97), reason: 'MOVING_AWAY' },
      { trendPoints: points(97, 97, 97), reason: 'RATE_TOO_SMALL' },
      {
        trendPoints: points(97.2, 97.1, 97),
        confidence: 'Developing' as const,
        reason: 'LOW_CONFIDENCE',
      },
    ];
    for (const testCase of cases) {
      const result = calculateAdaptiveGoalProgress({ ...base, ...testCase });
      expect(result.kind).toBe('weight_change');
      if (result.kind !== 'weight_change') continue;
      expect(result.actualProjection).toMatchObject({
        weeks: null,
        projectedStartDate: null,
        projectedEndDate: null,
        unavailableReason: testCase.reason,
      });
    }
  });

  it('keeps stale trend provenance separate from latest scale display data', () => {
    const result = calculateAdaptiveGoalProgress({
      goal: goal(),
      revision: revision(),
      currentLocalDate: '2026-02-01',
      currentTrendWeightKg: 97,
      latestScaleWeightKg: 96.4,
      latestWeightAgeDays: 9,
      confidence: 'High',
      trendPoints: points(97.2, 97.1, 97),
    });
    expect(result.currentTrendWeightKg).toBe(97);
    expect(result.latestScaleWeightKg).toBe(96.4);
    expect(result.provenance).toBe('stale_trend');
    expect(result.trendFreshness).toBe('stale');
  });

  it('returns null progress values and scale-only provenance when trend is missing', () => {
    const result = calculateAdaptiveGoalProgress({
      goal: goal(),
      revision: revision(),
      currentLocalDate: '2026-02-01',
      currentTrendWeightKg: null,
      latestScaleWeightKg: 97,
      latestWeightAgeDays: null,
      confidence: null,
      trendPoints: [],
    });
    expect(result.kind).toBe('weight_change');
    if (result.kind !== 'weight_change') return;
    expect(result.completedDistanceKg).toBeNull();
    expect(result.percentComplete).toBeNull();
    expect(result.provenance).toBe('scale_only');
    expect(result.status).toBe('insufficient_data');
  });

  it('handles defensive zero-distance progress', () => {
    const result = calculateAdaptiveGoalProgress({
      goal: goal({ startTrendWeightKg: 90 }),
      revision: revision(),
      currentLocalDate: '2026-02-01',
      currentTrendWeightKg: 90,
      latestScaleWeightKg: 90,
      latestWeightAgeDays: 0,
      confidence: 'High',
      trendPoints: points(90.2, 90.1, 90),
    });
    expect(result.kind).toBe('weight_change');
    if (result.kind !== 'weight_change') return;
    expect(result.totalDistanceKg).toBe(0);
    expect(result.percentComplete).toBe(100);
    expect(result.status).toBe('reached');
  });

  it('calculates maintenance range boundaries and never emits percent or ETA fields', () => {
    const centerWeightKg = 80;
    const radius = Math.max(
      ADAPTIVE_GOAL_PROGRESS_CONSTANTS.maintenanceMinimumRadiusKg,
      centerWeightKg * ADAPTIVE_GOAL_PROGRESS_CONSTANTS.maintenanceRadiusFraction,
    );
    const result = calculateAdaptiveGoalProgress({
      goal: goal({
        type: 'maintain',
        targetWeightKg: null,
        maintenanceCenterKg: centerWeightKg,
        goalRatePctPerWeek: 0,
      }),
      revision: revision({
        targetWeightKg: null,
        maintenanceCenterKg: centerWeightKg,
        goalRatePctPerWeek: 0,
        previousTargetWeightKg: null,
        previousCenterKg: centerWeightKg,
        previousRatePctPerWeek: 0,
      }),
      currentLocalDate: '2026-01-03',
      currentTrendWeightKg: centerWeightKg + radius * 0.9,
      latestScaleWeightKg: 81,
      latestWeightAgeDays: 0,
      confidence: 'High',
      trendPoints: points(80, 80.4, centerWeightKg + radius * 0.9),
    });
    expect(result.kind).toBe('maintenance');
    if (result.kind !== 'maintenance') return;
    expect(result.rangeRadiusKg).toBe(radius);
    expect(result.rangeStatus).toBe('near_edge');
    expect(result.observedDays).toBe(3);
    expect(result.daysWithinRange).toBe(3);
    expect(result).not.toHaveProperty('percentComplete');
    expect(result).not.toHaveProperty('desiredProjection');
  });

  it('rejects a revision from another goal', () => {
    expect(() =>
      calculateAdaptiveGoalProgress({
        goal: goal(),
        revision: revision({ goalId: 'other-goal' }),
        currentLocalDate: '2026-02-01',
        currentTrendWeightKg: 97,
        latestScaleWeightKg: 97,
        latestWeightAgeDays: 0,
        confidence: 'High',
        trendPoints: points(97.2, 97.1, 97),
      }),
    ).toThrow('Goal revision does not belong');
  });
});
