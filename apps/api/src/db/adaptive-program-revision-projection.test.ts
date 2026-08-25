import { describe, expect, it } from 'vitest';

import type { AdaptiveProgramCalculation } from '@pulse/shared';

import {
  resolveEffectiveProgramRevisions,
  resolveNextEffectiveProgramRevision,
} from './adaptive-program-revision-projection.js';

const snapshot = (timeZone: string): AdaptiveProgramCalculation => ({
  status: 'active',
  timeZone,
  rmrEquation: 'manual_tdee',
  heightCm: null,
  birthDate: null,
  activityLevel: null,
  activityMultiplier: null,
  estimatedRmrKcal: null,
  calculatedBaselineTdeeKcal: null,
  manualBaselineTdeeKcal: 2500,
  baselineTdeeKcal: 2500,
  goalType: 'maintain',
  targetWeightKg: null,
  goalRatePctPerWeek: 0,
  proteinGrams: 180,
  fatAllocationPct: 30,
  systemCalorieFloorKcal: 1500,
  userCalorieFloorKcal: 1500,
  algorithmVersion: 'adaptive-tdee-v1',
});

describe('adaptive program revision causal projection', () => {
  it('freezes westward and eastward edits on a nondecreasing local-date axis', () => {
    const resolved = resolveEffectiveProgramRevisions([
      {
        id: 'tokyo-initial',
        sequence: 1,
        effectiveAt: Date.parse('2026-08-18T00:59:00.000Z'),
        snapshot: snapshot('Asia/Tokyo'),
      },
      {
        id: 'los-angeles',
        sequence: 2,
        effectiveAt: Date.parse('2026-08-18T01:00:00.000Z'),
        snapshot: snapshot('America/Los_Angeles'),
      },
      {
        id: 'tokyo-again',
        sequence: 3,
        effectiveAt: Date.parse('2026-08-18T02:00:00.000Z'),
        snapshot: snapshot('Asia/Tokyo'),
      },
    ]);

    expect(resolved.map((revision) => revision.effectiveLocalDate)).toEqual([
      '2026-08-18',
      '2026-08-18',
      '2026-08-18',
    ]);
  });

  it('rejects sequence gaps, decreasing instants, and invalid IANA zones', () => {
    const first = resolveNextEffectiveProgramRevision(undefined, {
      id: 'first',
      sequence: 1,
      effectiveAt: 100,
      snapshot: snapshot('UTC'),
    });
    expect(() =>
      resolveNextEffectiveProgramRevision(first, {
        id: 'gap',
        sequence: 3,
        effectiveAt: 101,
        snapshot: snapshot('UTC'),
      }),
    ).toThrow('sequence is not contiguous');
    expect(() =>
      resolveNextEffectiveProgramRevision(first, {
        id: 'backdated',
        sequence: 2,
        effectiveAt: 99,
        snapshot: snapshot('UTC'),
      }),
    ).toThrow('timestamps are not causal');
    expect(() =>
      resolveNextEffectiveProgramRevision(undefined, {
        id: 'bad-zone',
        sequence: 1,
        effectiveAt: 100,
        snapshot: snapshot('Mars/Olympus_Mons'),
      }),
    ).toThrow();
  });
});
