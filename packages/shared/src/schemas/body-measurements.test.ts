import { describe, expect, it } from 'vitest';

import {
  bodyMeasurementEntrySchema,
  bodyMeasurementQueryParamsSchema,
  createBodyMeasurementInputSchema,
  patchBodyMeasurementInputSchema,
} from './body-measurements.js';

describe('body measurement input schemas', () => {
  it('accepts independently optional measurements and normalizes notes', () => {
    expect(
      createBodyMeasurementInputSchema.parse({
        date: '2026-09-14',
        unit: 'in',
        waist: 32.1,
        left_arm: null,
        body_fat_percent: 18.4,
        notes: '  self reported  ',
      }),
    ).toEqual({
      date: '2026-09-14',
      unit: 'in',
      waist: 32.1,
      left_arm: null,
      body_fat_percent: 18.4,
      notes: 'self reported',
    });
    expect(patchBodyMeasurementInputSchema.parse({ body_fat_percent: 20, notes: '   ' })).toEqual({
      body_fat_percent: 20,
      notes: null,
    });
  });

  it.each([
    [{ date: '2026-02-30', unit: 'cm', waist: 80 }, 'malformed date'],
    [{ date: '2026-09-14', unit: 'mm', waist: 800 }, 'invalid unit'],
    [{ date: '2026-09-14', waist: 80 }, 'missing unit'],
    [{ date: '2026-09-14', unit: 'cm', body_fat_percent: 20 }, 'unit without circumference'],
    [{ date: '2026-09-14', unit: 'cm', waist: 80.12 }, 'over-precision circumference'],
    [{ date: '2026-09-14', body_fat_percent: 20.12 }, 'over-precision body fat'],
    [{ date: '2026-09-14', unit: 'cm', waist: 19.9 }, 'low circumference'],
    [{ date: '2026-09-14', unit: 'cm', waist: 300.1 }, 'high circumference'],
    [{ date: '2026-09-14', body_fat_percent: 0.9 }, 'low body fat'],
    [{ date: '2026-09-14', body_fat_percent: 70.1 }, 'high body fat'],
    [{ date: '2026-09-14', unit: 'cm', waist: Number.NaN }, 'NaN'],
    [{ date: '2026-09-14', unit: 'cm', waist: Number.POSITIVE_INFINITY }, 'infinity'],
    [{ date: '2026-09-14', waist: '   ' }, 'whitespace numeric value'],
    [{ date: '2026-09-14' }, 'empty create'],
    [{ date: '2026-09-14', body_fat_percent: 20, unexpected: true }, 'unknown field'],
  ])('rejects %s (%s)', (payload) => {
    expect(() => createBodyMeasurementInputSchema.parse(payload)).toThrow();
  });

  it('requires patch content and enforces circumference unit coupling', () => {
    expect(() => patchBodyMeasurementInputSchema.parse({})).toThrow();
    expect(() => patchBodyMeasurementInputSchema.parse({ unit: 'in' })).toThrow();
    expect(() => patchBodyMeasurementInputSchema.parse({ chest: 40 })).toThrow();
    expect(patchBodyMeasurementInputSchema.parse({ chest: null })).toEqual({ chest: null });
    expect(() => patchBodyMeasurementInputSchema.parse({ notes: null, extra: true })).toThrow();
  });
});

describe('body measurement response and query schemas', () => {
  const entry = {
    id: 'measurement-1',
    date: '2026-09-14',
    waistMm: 813,
    hipsMm: null,
    chestMm: null,
    neckMm: null,
    leftArmMm: null,
    rightArmMm: null,
    leftThighMm: null,
    rightThighMm: null,
    bodyFatPercent: 18.4,
    unitAtEntry: 'in',
    notes: null,
    createdAt: 1,
    updatedAt: 1,
  };

  it('keeps body fat as a user-reported fact and rejects empty or expanded responses', () => {
    expect(bodyMeasurementEntrySchema.parse(entry).bodyFatPercent).toBe(18.4);
    expect(() =>
      bodyMeasurementEntrySchema.parse({ ...entry, waistMm: null, bodyFatPercent: null }),
    ).toThrow();
    expect(() =>
      bodyMeasurementEntrySchema.parse({ ...entry, derivedBodyFatPercent: 19 }),
    ).toThrow();
    expect(() => bodyMeasurementEntrySchema.parse({ ...entry, unitAtEntry: null })).toThrow();
  });

  it('provides bounded deterministic range and pagination inputs', () => {
    expect(bodyMeasurementQueryParamsSchema.parse({ page: '2', limit: '25' })).toEqual({
      page: 2,
      limit: 25,
    });
    expect(() =>
      bodyMeasurementQueryParamsSchema.parse({ from: '2026-09-15', to: '2026-09-14' }),
    ).toThrow();
    expect(() =>
      bodyMeasurementQueryParamsSchema.parse({ from: '2026-09-01', days: 14 }),
    ).toThrow();
    expect(() => bodyMeasurementQueryParamsSchema.parse({ limit: 201 })).toThrow();
  });
});
