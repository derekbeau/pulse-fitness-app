import { describe, expect, it } from 'vitest';

import type { EnergyBalancePoint } from '../schemas/energy-balance.js';
import {
  aggregateEnergyBalancePoints,
  explainEnergyBalance,
  resolveEnergyBalanceRange,
  summarizeEnergyBalance,
} from './energy-balance.js';

const fingerprint = 'a'.repeat(64);

const point = (date: string, overrides: Partial<EnergyBalancePoint> = {}): EnergyBalancePoint => ({
  periodStart: date,
  periodEnd: date,
  nutritionStatus: 'complete',
  sourceNutritionStatus: 'complete',
  nutritionLogIds: [`nutrition-${date}`],
  loggedIntakeKcal: 2520,
  intakeKcal: 2520,
  includedInBalance: true,
  completeNutritionDays: 1,
  partialNutritionDays: 0,
  unknownNutritionDays: 0,
  missingNutritionDays: 0,
  excludedNutritionDays: 0,
  targetKcal: 2400,
  targetIds: ['target-1'],
  expenditureKcal: 2760,
  trendWeightKg: 80,
  goalType: 'maintain',
  state: 'updating',
  calculationState: 'updating',
  calculationReasonCodes: [],
  reasonCodes: [],
  expenditureSourceCheckInId: 'check-in-1',
  expenditureSourceInputFingerprint: fingerprint,
  stateSourceCheckInId: 'check-in-1',
  stateSourceInputFingerprint: fingerprint,
  sourceCheckInIds: ['check-in-1'],
  sourceInputFingerprints: [fingerprint],
  goalRevisionIds: ['revision-1'],
  ...overrides,
});

describe('energy balance calculations', () => {
  it.each([
    ['lose', 2400, 120, 'INTAKE_ABOVE_TARGET'],
    ['maintain', 2760, -240, 'INTAKE_BELOW_TARGET'],
    ['gain', 3000, -480, 'INTAKE_BELOW_TARGET'],
  ] as const)(
    'keeps target and expenditure signs independent of a %s goal',
    (goalType, targetKcal, targetDifference, targetReason) => {
      const summary = summarizeEnergyBalance({
        points: [point('2026-08-18', { goalType, targetKcal })],
        calendarDays: 1,
        rangePreset: '1m',
      });

      expect(summary.averageIntakeMinusTargetKcal).toBe(targetDifference);
      expect(summary.averageIntakeMinusExpenditureKcal).toBe(-240);
      expect(summary.reasonCodes).toEqual(
        expect.arrayContaining([targetReason, 'INTAKE_BELOW_EXPENDITURE']),
      );
      expect(explainEnergyBalance(summary).detail).toContain('240 kcal below expenditure');
      expect(point('2026-08-18', { goalType }).goalType).toBe(goalType);
    },
  );

  it('never treats partial, unknown, missing, or excluded days as zero', () => {
    const points = [
      point('2026-08-11', { loggedIntakeKcal: 2400, intakeKcal: 2400 }),
      point('2026-08-12', {
        nutritionStatus: 'partial',
        sourceNutritionStatus: 'partial',
        loggedIntakeKcal: 900,
        intakeKcal: null,
        includedInBalance: false,
        completeNutritionDays: 0,
        partialNutritionDays: 1,
        excludedNutritionDays: 1,
      }),
      point('2026-08-13', {
        nutritionStatus: 'unknown',
        sourceNutritionStatus: 'unknown',
        loggedIntakeKcal: 700,
        intakeKcal: null,
        includedInBalance: false,
        completeNutritionDays: 0,
        unknownNutritionDays: 1,
        excludedNutritionDays: 1,
      }),
      point('2026-08-14', {
        nutritionStatus: 'missing',
        sourceNutritionStatus: null,
        nutritionLogIds: [],
        loggedIntakeKcal: null,
        intakeKcal: null,
        includedInBalance: false,
        completeNutritionDays: 0,
        missingNutritionDays: 1,
        excludedNutritionDays: 1,
      }),
    ];

    const summary = summarizeEnergyBalance({ points, calendarDays: 4, rangePreset: '1w' });

    expect(summary.averageIntakeKcal).toBe(2400);
    expect(summary.completeNutritionDays).toBe(1);
    expect(summary.excludedNutritionDays).toBe(3);
    expect(summary.coverageRatio).toBe(0.25);
    expect(summary.predictedModeledDays).toBe(1);
    expect(summary.reconciliationComparable).toBe(false);
  });

  it('reconciles half-open daily intervals without using intake on the ending observation date', () => {
    const points = Array.from({ length: 7 }, (_, index) =>
      point(`2026-08-${String(11 + index).padStart(2, '0')}`, {
        intakeKcal: 2520,
        expenditureKcal: 2760,
        trendWeightKg: index === 0 ? 80 : index === 6 ? 79.8 : 80 - index / 30,
      }),
    );
    const summary = summarizeEnergyBalance({ points, calendarDays: 7, rangePreset: '1w' });

    expect(summary.predictedModeledDays).toBe(6);
    expect(summary.predictedWeightChangeKg).toBeCloseTo(-1440 / 7700, 4);
    expect(summary.observedTrendWeightChangeKg).toBeCloseTo(-0.2, 4);
    expect(summary.reconciliationComparable).toBe(true);
    expect(summary.reasonCodes).toContain('SHORT_WINDOW_NOISY');

    const changedEndingIntake = summarizeEnergyBalance({
      points: points.map((value, index) =>
        index === 6 ? { ...value, loggedIntakeKcal: 9000, intakeKcal: 9000 } : value,
      ),
      calendarDays: 7,
      rangePreset: '1w',
    });
    expect(changedEndingIntake.predictedModeledDays).toBe(6);
    expect(changedEndingIntake.predictedWeightChangeKg).toBe(summary.predictedWeightChangeKg);

    const incomplete = summarizeEnergyBalance({
      points: points.map((value, index) =>
        index === 3
          ? {
              ...value,
              nutritionStatus: 'missing' as const,
              sourceNutritionStatus: null,
              nutritionLogIds: [],
              loggedIntakeKcal: null,
              intakeKcal: null,
              includedInBalance: false,
              completeNutritionDays: 0,
              missingNutritionDays: 1,
              excludedNutritionDays: 1,
            }
          : value,
      ),
      calendarDays: 7,
      rangePreset: '1w',
    });
    expect(incomplete.predictedModeledDays).toBe(5);
    expect(incomplete.predictedWeightChangeKg).toBeCloseTo(-1200 / 7700, 4);
    expect(incomplete.reconciliationComparable).toBe(false);
    expect(incomplete.reasonCodes).toContain('INCOMPLETE_RECONCILIATION_COVERAGE');
  });

  it('does not expose an observed interval from a single Trend Weight point', () => {
    const summary = summarizeEnergyBalance({
      points: [point('2026-08-18')],
      calendarDays: 1,
      rangePreset: '1m',
    });

    expect(summary.predictedWeightChangeKg).toBeNull();
    expect(summary.predictedModeledDays).toBe(0);
    expect(summary.observedTrendWeightChangeKg).toBeNull();
    expect(summary.observedTrendStartDate).toBeNull();
    expect(summary.observedTrendEndDate).toBeNull();
    expect(summary.reconciliationComparable).toBe(false);
  });

  it('averages benchmarks independently and reconciles only the observed trend interval', () => {
    const points = [
      point('2026-08-10', {
        intakeKcal: 3000,
        targetKcal: 2000,
        expenditureKcal: 3000,
        trendWeightKg: null,
      }),
      point('2026-08-11', { trendWeightKg: 80, targetKcal: 2400, expenditureKcal: 2760 }),
      point('2026-08-12', {
        nutritionStatus: 'missing',
        sourceNutritionStatus: null,
        nutritionLogIds: [],
        loggedIntakeKcal: null,
        intakeKcal: null,
        includedInBalance: false,
        completeNutritionDays: 0,
        missingNutritionDays: 1,
        excludedNutritionDays: 1,
        targetKcal: 2600,
        expenditureKcal: 2800,
        trendWeightKg: 79.98,
      }),
      point('2026-08-13', { trendWeightKg: 79.96, targetKcal: 2800, expenditureKcal: 2840 }),
    ];

    const summary = summarizeEnergyBalance({ points, calendarDays: 4, rangePreset: '1m' });

    expect(summary.averageTargetKcal).toBe(2450);
    expect(summary.averageExpenditureKcal).toBe(2850);
    expect(summary.predictedModeledDays).toBe(1);
    expect(summary.predictedWeightChangeKg).toBeCloseTo((2520 - 2760) / 7700, 4);
    expect(summary.reconciliationComparable).toBe(false);
  });

  it('resolves inclusive ranges and Monday-start weekly aggregation', () => {
    expect(
      resolveEnergyBalanceRange({
        preset: '1m',
        endDate: '2026-08-18',
        firstAvailableDate: '2025-01-01',
        aggregation: 'auto',
      }),
    ).toMatchObject({ startDate: '2026-07-20', endDate: '2026-08-18', calendarDays: 30 });

    const aggregated = aggregateEnergyBalancePoints(
      [point('2026-08-16'), point('2026-08-17')],
      'weekly',
    );
    expect(aggregated).toHaveLength(2);
    expect(aggregated.map((value) => value.periodStart)).toEqual(['2026-08-16', '2026-08-17']);
  });

  it('aggregates complete and missing days in the same week without inventing intake', () => {
    const missing = point('2026-08-12', {
      nutritionStatus: 'missing',
      sourceNutritionStatus: null,
      nutritionLogIds: [],
      loggedIntakeKcal: null,
      intakeKcal: null,
      includedInBalance: false,
      completeNutritionDays: 0,
      missingNutritionDays: 1,
      excludedNutritionDays: 1,
    });
    const [weekly] = aggregateEnergyBalancePoints([point('2026-08-11'), missing], 'weekly');

    expect(weekly).toMatchObject({
      nutritionStatus: 'mixed',
      includedInBalance: true,
      intakeKcal: 2520,
      completeNutritionDays: 1,
      missingNutritionDays: 1,
    });
  });
});
