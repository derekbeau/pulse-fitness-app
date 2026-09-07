import type { ExerciseTrackingType } from '@pulse/shared';
import { describe, expect, it } from 'vitest';

import { formatEffort } from './effort';
import { formatCompactSets, formatSetSummary } from './tracking';

const resistance: ExerciseTrackingType[] = ['weight_reps', 'bodyweight_reps', 'reps_only'];
const other: ExerciseTrackingType[] = [
  'weight_seconds',
  'seconds_only',
  'reps_seconds',
  'duration',
  'distance',
  'cardio',
];

describe.each(resistance)('%s effort presentation', (trackingType) => {
  it.each([0, 4, 5])('keeps native RIR %i exact, including the lower-bound bucket', (rir) => {
    expect(formatEffort({ rir, rpe: null }, trackingType)).toMatchObject({
      displayText: `${rir === 5 ? '5+' : rir} RIR`,
      rawRir: rir,
      rawRpe: null,
      provenance: 'native',
      isLowerBound: rir === 5,
    });
  });
  it.each([
    [10, '0'],
    [9, '1'],
    [8, '2'],
    [7, '3'],
    [6, '4'],
    [5, '5+'],
    [4, '5+'],
    [3, '5+'],
    [2, '5+'],
    [1, '5+'],
  ])('derives stored RPE %i as approximately %s RIR', (rpe, value) => {
    const facts = Object.freeze({ rpe: Number(rpe), rir: null });
    const result = formatEffort(facts, trackingType);
    expect(result).toMatchObject({
      displayText: `≈ ${value} RIR`,
      rawRpe: rpe,
      rawRir: null,
      provenance: 'derived',
      isLowerBound: value === '5+',
    });
    expect(result.detail).toContain(`Derived approximately from stored RPE ${rpe}`);
    expect(result.detail).toContain('raw value unchanged');
    expect(facts).toEqual({ rpe, rir: null });
  });
  it('keeps missing effort missing', () => {
    expect(formatEffort({ rir: null, rpe: null }, trackingType)).toMatchObject({
      displayText: null,
      provenance: 'missing',
      isLowerBound: false,
    });
    expect(formatEffort({}, trackingType).displayText).toBeNull();
  });
  it('prefers native zero while exposing both inconsistent raw facts', () => {
    const facts = Object.freeze({ rir: 0, rpe: 6 });
    const effort = formatEffort(facts, trackingType);
    expect(effort).toMatchObject({
      displayText: '0 RIR',
      rawRir: 0,
      rawRpe: 6,
      provenance: 'native',
    });
    expect(effort.detail).toContain('Stored RIR: 0; stored RPE: 6');
    expect(facts).toEqual({ rir: 0, rpe: 6 });
  });
  it.each([0, 11, 8.5])('reports out-of-contract RPE %s without inventing a conversion', (rpe) => {
    expect(formatEffort({ rpe }, trackingType)).toMatchObject({
      displayText: `RPE ${rpe} (unsupported)`,
      rawRpe: rpe,
      provenance: 'unsupported',
      isLowerBound: false,
    });
  });
});

it.each(other)('leaves %s effort in its stored scale', (trackingType) => {
  expect(formatEffort({ rir: null, rpe: 8 }, trackingType)).toMatchObject({
    displayText: 'RPE 8',
    provenance: 'native',
  });
  expect(
    formatSetSummary(
      { reps: 6, weight: 25, seconds: 60, distance: 2, rpe: 8, zone: 2 },
      trackingType,
    ),
  ).toContain('(RPE 8 / Zone 2)');
  expect(
    formatCompactSets([{ reps: 6, weight: 25, seconds: 60, distance: 2, rpe: 8 }], trackingType),
  ).toContain('(RPE 8)');
});

it('formats populated mixed history per set without mutating its raw API facts', () => {
  const sets = [
    Object.freeze({ setNumber: 1, weight: 135, reps: 8, rir: 0, rpe: null }),
    Object.freeze({ setNumber: 2, weight: 135, reps: 8, rir: 5, rpe: null }),
    Object.freeze({ setNumber: 3, weight: 135, reps: 8, rir: null, rpe: 8 }),
    Object.freeze({ setNumber: 4, weight: 135, reps: 8, rir: null, rpe: 1 }),
    Object.freeze({ setNumber: 5, weight: 135, reps: 8, rir: null, rpe: null }),
  ];
  const before = JSON.stringify(sets);
  expect(formatCompactSets(sets, 'weight_reps')).toBe(
    '135x8 (0 RIR), 135x8 (5+ RIR), 135x8 (≈ 2 RIR), 135x8 (≈ 5+ RIR), 135x8',
  );
  expect(formatSetSummary(sets[2], 'weight_reps')).toBe('135 lbs × 8 reps (≈ 2 RIR)');
  expect(JSON.stringify(sets)).toBe(before);
});
