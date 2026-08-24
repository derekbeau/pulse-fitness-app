import { describe, expect, it } from 'vitest';

import { dailyEnergyAdherenceSchema } from '../schemas/daily-energy-adherence.js';
import { calculateDailyEnergyAdherence } from './daily-energy-adherence.js';

const completeDay = {
  localDate: '2026-08-18',
  todayLocalDate: '2026-08-19',
  nutritionStatus: 'complete' as const,
  expenditureKcal: 2_500,
};

describe('calculateDailyEnergyAdherence', () => {
  it.each([
    { target: 1_500, inner: 100, outer: 250 },
    { target: 2_500, inner: 125, outer: 250 },
    { target: 3_000, inner: 150, outer: 300 },
    { target: 5_000, inner: 150, outer: 400 },
  ])('clamps tolerance bands for a $target kcal target', ({ target, inner, outer }) => {
    const result = calculateDailyEnergyAdherence({
      ...completeDay,
      intakeKcal: target,
      targetKcal: target,
    });

    expect(result).toMatchObject({
      dataState: 'gradeable',
      innerToleranceKcal: inner,
      outerToleranceKcal: outer,
      adherence: 'on_target',
    });
  });

  it.each([
    { target: 2_009, inner: 100, outer: 250 },
    { target: 2_010, inner: 101, outer: 250 },
    { target: 2_504, inner: 125, outer: 250 },
    { target: 2_505, inner: 125, outer: 251 },
    { target: 2_989, inner: 149, outer: 299 },
    { target: 2_990, inner: 150, outer: 299 },
    { target: 3_994, inner: 150, outer: 399 },
    { target: 3_995, inner: 150, outer: 400 },
    { target: 4_000, inner: 150, outer: 400 },
    { target: 4_001, inner: 150, outer: 400 },
  ])(
    'keeps the percentage and clamp transition exact at $target kcal',
    ({ target, inner, outer }) => {
      expect(
        calculateDailyEnergyAdherence({
          ...completeDay,
          intakeKcal: target,
          targetKcal: target,
        }),
      ).toMatchObject({ innerToleranceKcal: inner, outerToleranceKcal: outer });
    },
  );

  it.each(['lose', 'maintain', 'gain'] as const)(
    'uses identical symmetric distance semantics for a %s program',
    () => {
      const below = calculateDailyEnergyAdherence({
        ...completeDay,
        intakeKcal: 1_749,
        targetKcal: 2_000,
      });
      const above = calculateDailyEnergyAdherence({
        ...completeDay,
        intakeKcal: 2_251,
        targetKcal: 2_000,
      });

      expect(below.adherence).toBe('off_target');
      expect(above.adherence).toBe('off_target');
      expect(Math.abs(below.intakeMinusTargetKcal ?? 0)).toBe(
        Math.abs(above.intakeMinusTargetKcal ?? 0),
      );
    },
  );

  it.each([
    { difference: -100, expected: 'on_target' },
    { difference: 100, expected: 'on_target' },
    { difference: -101, expected: 'near_target' },
    { difference: 101, expected: 'near_target' },
    { difference: -250, expected: 'near_target' },
    { difference: 250, expected: 'near_target' },
    { difference: -251, expected: 'off_target' },
    { difference: 251, expected: 'off_target' },
  ])('grades signed $difference kcal symmetrically as $expected', ({ difference, expected }) => {
    const result = calculateDailyEnergyAdherence({
      ...completeDay,
      intakeKcal: 2_000 + difference,
      targetKcal: 2_000,
    });

    expect(result.adherence).toBe(expected);
    expect(result.intakeMinusTargetKcal).toBe(difference);
  });

  it.each([
    { localDate: '2026-08-20', status: null, state: 'future' },
    { localDate: '2026-08-19', status: null, state: 'in_progress' },
    { localDate: '2026-08-19', status: 'partial' as const, state: 'in_progress' },
    { localDate: '2026-08-19', status: 'complete' as const, state: 'pending_cutoff' },
    { localDate: '2026-08-18', status: null, state: 'missing' },
    { localDate: '2026-08-18', status: 'partial' as const, state: 'partial' },
    { localDate: '2026-08-18', status: 'unknown' as const, state: 'unknown' },
  ])('does not grade $state evidence', ({ localDate, status, state }) => {
    const result = calculateDailyEnergyAdherence({
      localDate,
      todayLocalDate: '2026-08-19',
      nutritionStatus: status,
      intakeKcal: status === null ? null : 2_400,
      targetKcal: 2_400,
      expenditureKcal: 2_600,
    });

    expect(result.dataState).toBe(state);
    expect(result.adherence).toBeNull();
  });

  it('keeps missing accepted facts null instead of inventing zeroes', () => {
    expect(
      calculateDailyEnergyAdherence({
        ...completeDay,
        intakeKcal: 2_100.4,
        targetKcal: null,
        expenditureKcal: null,
      }),
    ).toEqual({
      dataState: 'unavailable',
      intakeKcal: 2_100,
      targetKcal: null,
      expenditureKcal: null,
      intakeMinusTargetKcal: null,
      intakeMinusExpenditureKcal: null,
      innerToleranceKcal: null,
      outerToleranceKcal: null,
      adherence: null,
      reasonCodes: ['NO_ACCEPTED_TARGET', 'NO_ACCEPTED_EXPENDITURE'],
    });
  });
});

describe('dailyEnergyAdherenceSchema', () => {
  const valid = {
    localDate: '2026-08-18',
    timeZone: 'America/Detroit',
    todayLocalDate: '2026-08-19',
    completedDayCutoff: '2026-08-18',
    isHistorical: true,
    dataState: 'gradeable',
    nutrition: {
      logId: 'log-1',
      status: 'complete',
      intakeKcal: 2_100,
      mealCount: 3,
      itemCount: 8,
    },
    target: {
      targetEventId: 'event-1',
      targetId: 'target-1',
      effectiveDate: '2026-08-01',
      recordedAt: 1_775_000_000_000,
      caloriesKcal: 2_000,
      source: 'adaptive',
      adaptiveCheckInId: 'check-in-1',
    },
    expenditure: {
      caloriesKcal: 2_500,
      effectiveDate: '2026-08-01',
      source: 'accepted_check_in',
      checkInId: 'check-in-1',
      inputFingerprint: 'a'.repeat(64),
    },
    intakeMinusTargetKcal: 100,
    intakeMinusExpenditureKcal: -400,
    innerToleranceKcal: 100,
    outerToleranceKcal: 250,
    adherence: 'on_target',
    reasonCodes: [],
  };

  it('parses a strict server-authored response', () => {
    expect(dailyEnergyAdherenceSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['incorrect target difference', { intakeMinusTargetKcal: 99 }],
    ['incomplete graded day', { dataState: 'partial', adherence: 'on_target' }],
    [
      'missing accepted provenance',
      {
        expenditure: {
          ...valid.expenditure,
          checkInId: null,
        },
      },
    ],
    ['incorrect tolerance', { innerToleranceKcal: 101 }],
    ['incorrect adherence', { adherence: 'near_target' }],
    ['missing evidence reason', { reasonCodes: ['NO_ACCEPTED_EXPENDITURE'] }],
    ['invalid time zone', { timeZone: 'Detroit' }],
    [
      'manual target with check-in provenance',
      {
        target: {
          ...valid.target,
          source: 'manual',
        },
      },
    ],
    [
      'log without intake',
      {
        nutrition: {
          ...valid.nutrition,
          intakeKcal: null,
        },
        intakeMinusTargetKcal: null,
        intakeMinusExpenditureKcal: null,
      },
    ],
    ['unknown transport field', { extra: true }],
  ])('rejects %s', (_name, change) => {
    expect(() => dailyEnergyAdherenceSchema.parse({ ...valid, ...change })).toThrow();
  });
});
