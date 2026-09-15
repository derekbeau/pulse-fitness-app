import { describe, expect, it } from 'vitest';

import {
  createBodyCheckInInputSchema,
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
});
