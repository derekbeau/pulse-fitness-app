import type { LengthUnit } from '../schemas/body-measurements.js';

export type BodyReadingQuality =
  | 'single_reading'
  | 'replicated'
  | 'needs_third_reading'
  | 'replicated_with_tiebreaker'
  | 'high_variance';

export type CanonicalBodyReading = {
  readingMm: [number, number | null, number | null];
  canonicalMm: number;
  quality: BodyReadingQuality;
  selectedReadingPair: [1 | 2 | 3, 1 | 2 | 3] | null;
};

const toMm = (value: number, unit: LengthUnit) => Math.round(value * (unit === 'cm' ? 10 : 25.4));

export const calculateCanonicalBodyReading = (
  readings: number[],
  unit: LengthUnit,
): CanonicalBodyReading => {
  if (readings.length < 1 || readings.length > 3) {
    throw new RangeError('One to three readings are required');
  }
  const mm = readings.map((value) => toMm(value, unit));
  if (mm.some((value) => !Number.isInteger(value) || value < 200 || value > 3000)) {
    throw new RangeError('Readings must be between 20 and 300 cm after conversion');
  }
  const [first, second, third] = mm;
  if (first === undefined) throw new RangeError('At least one reading is required');
  if (second === undefined) {
    return {
      readingMm: [first, null, null],
      canonicalMm: first,
      quality: 'single_reading',
      selectedReadingPair: null,
    };
  }
  if (third === undefined) {
    return {
      readingMm: [first, second, null],
      canonicalMm: Math.round((first + second) / 2),
      quality: Math.abs(first - second) <= 10 ? 'replicated' : 'needs_third_reading',
      selectedReadingPair: [1, 2],
    };
  }

  const pairs = [
    { pair: [1, 2] as const, distance: Math.abs(first - second), values: [first, second] },
    { pair: [1, 3] as const, distance: Math.abs(first - third), values: [first, third] },
    { pair: [2, 3] as const, distance: Math.abs(second - third), values: [second, third] },
  ];
  const selected = pairs.reduce((best, candidate) =>
    candidate.distance < best.distance ? candidate : best,
  );
  return {
    readingMm: [first, second, third],
    canonicalMm: Math.round((selected.values[0] + selected.values[1]) / 2),
    quality:
      Math.max(...mm) - Math.min(...mm) > 20 ? 'high_variance' : 'replicated_with_tiebreaker',
    selectedReadingPair: [...selected.pair],
  };
};
