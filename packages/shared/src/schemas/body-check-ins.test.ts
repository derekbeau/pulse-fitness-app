import { describe, expect, it } from 'vitest';

import {
  bodyCheckInMeasurementDraftInputSchema,
  bodyCheckInPreferenceSchema,
  createBodyCheckInInputSchema,
  patchBodyCheckInInputSchema,
  patchBodyCheckInPreferenceSchema,
} from './body-check-ins.js';

describe('body check-in shared contracts', () => {
  it('enforces site laterality and unique measurements', () => {
    expect(() =>
      createBodyCheckInInputSchema.parse({
        date: '2026-09-14',
        status: 'draft',
        measurements: [
          { site: 'waist_iliac_crest_nhanes', laterality: 'right', unit: 'cm', readings: [80] },
        ],
      }),
    ).toThrow(/none laterality/);
    expect(() =>
      createBodyCheckInInputSchema.parse({
        date: '2026-09-14',
        status: 'draft',
        measurements: [
          { site: 'thigh_midpoint', laterality: 'right', unit: 'cm', readings: [55] },
          { site: 'thigh_midpoint', laterality: 'right', unit: 'cm', readings: [55.2] },
        ],
      }),
    ).toThrow(/unique/);
  });

  it('accepts every selectable pair together and preserves bilateral sides independently', () => {
    const enabledSites = [
      { site: 'waist_iliac_crest_nhanes', laterality: 'none' },
      { site: 'chest_nipple_line_relaxed', laterality: 'none' },
      { site: 'hips_maximum', laterality: 'none' },
      { site: 'upper_arm_midpoint_flexed', laterality: 'left' },
      { site: 'upper_arm_midpoint_flexed', laterality: 'right' },
      { site: 'thigh_midpoint', laterality: 'left' },
      { site: 'thigh_midpoint', laterality: 'right' },
      { site: 'calf_maximum_relaxed', laterality: 'left' },
      { site: 'calf_maximum_relaxed', laterality: 'right' },
      { site: 'forearm_maximum_relaxed', laterality: 'left' },
      { site: 'forearm_maximum_relaxed', laterality: 'right' },
      { site: 'neck_below_larynx_relaxed', laterality: 'none' },
      { site: 'shoulder_girth_deltoid', laterality: 'none' },
    ];
    expect(
      bodyCheckInPreferenceSchema.parse({
        contractVersion: 'body-check-ins-v1',
        measurementCadenceDays: 14,
        lengthUnit: 'cm',
        enabledSites,
        anchorDate: '2026-09-14',
        reminderLocalTime: null,
        protocolVersion: 'body-circumference-v2',
        snoozedUntil: null,
        lastDismissedDueDate: null,
        createdAt: 1,
        updatedAt: 1,
      }).enabledSites,
    ).toEqual(enabledSites);
  });

  it('enforces new-site laterality and reviewed product bounds', () => {
    expect(() =>
      bodyCheckInMeasurementDraftInputSchema.parse({
        site: 'calf_maximum_relaxed',
        laterality: 'none',
        unit: 'cm',
        readings: [35],
      }),
    ).toThrow(/left or right/);
    expect(() =>
      bodyCheckInMeasurementDraftInputSchema.parse({
        site: 'neck_below_larynx_relaxed',
        laterality: 'left',
        unit: 'cm',
        readings: [38],
      }),
    ).toThrow(/none laterality/);
    expect(() =>
      bodyCheckInMeasurementDraftInputSchema.parse({
        site: 'forearm_maximum_relaxed',
        laterality: 'left',
        unit: 'cm',
        readings: [61],
      }),
    ).toThrow(/10 and 60 cm/);
    expect(
      bodyCheckInMeasurementDraftInputSchema.parse({
        site: 'shoulder_girth_deltoid',
        laterality: 'none',
        unit: 'in',
        readings: [48],
      }),
    ).toBeTruthy();
  });

  it('allows discordant pairs in drafts but requires a third reading on completion', () => {
    const input = {
      date: '2026-09-14',
      measurements: [
        {
          site: 'waist_iliac_crest_nhanes' as const,
          laterality: 'none' as const,
          unit: 'cm' as const,
          readings: [80, 81.1],
        },
      ],
    };
    expect(createBodyCheckInInputSchema.parse({ ...input, status: 'draft' })).toBeTruthy();
    expect(() => createBodyCheckInInputSchema.parse({ ...input, status: 'completed' })).toThrow(
      /third reading/,
    );
  });

  it('requires an explicit cadence anchor decision', () => {
    expect(() => patchBodyCheckInPreferenceSchema.parse({ measurementCadenceDays: 28 })).toThrow(
      /explicitly preserve or restart/,
    );
    expect(
      patchBodyCheckInPreferenceSchema.parse({
        measurementCadenceDays: 28,
        cadenceChange: 'restart',
        restartAnchorDate: '2026-09-15',
      }),
    ).toBeTruthy();
    expect(() =>
      patchBodyCheckInPreferenceSchema.parse({
        measurementCadenceDays: 14,
        cadenceChange: 'preserve_anchor',
        anchorDate: '2026-09-20',
      }),
    ).toThrow(/cannot replace/);
  });

  it('requires optimistic concurrency on every check-in patch', () => {
    expect(() => patchBodyCheckInInputSchema.parse({ notes: 'stale write' })).toThrow();
    expect(() => patchBodyCheckInInputSchema.parse({ expectedVersion: 1 })).toThrow(
      /At least one field/,
    );
    expect(
      patchBodyCheckInInputSchema.parse({ expectedVersion: 1, notes: 'serialized write' }),
    ).toMatchObject({ expectedVersion: 1 });
  });
});
