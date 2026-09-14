import type { LengthUnit } from '../schemas/body-measurements.js';

export const MIN_CIRCUMFERENCE_MM = 200;
export const MAX_CIRCUMFERENCE_MM = 3_000;

export const hasAtMostOneDecimalPlace = (value: number): boolean =>
  Number.isFinite(value) && Math.abs(value * 10 - Math.round(value * 10)) < 1e-8;

export const isCanonicalCircumferenceMm = (value: number): boolean =>
  Number.isInteger(value) && value >= MIN_CIRCUMFERENCE_MM && value <= MAX_CIRCUMFERENCE_MM;

export const convertCircumferenceToMm = (value: number, unit: LengthUnit): number => {
  if (!hasAtMostOneDecimalPlace(value)) {
    throw new RangeError('Circumference must have no more than one decimal place');
  }

  const millimetres = Math.round(value * (unit === 'cm' ? 10 : 25.4));
  if (!isCanonicalCircumferenceMm(millimetres)) {
    throw new RangeError('Circumference must be between 20 and 300 cm after conversion');
  }

  return millimetres;
};

export const convertCircumferenceFromMm = (millimetres: number, unit: LengthUnit): number => {
  if (!isCanonicalCircumferenceMm(millimetres)) {
    throw new RangeError('Canonical circumference must be an integer between 200 and 3000 mm');
  }

  return Number((millimetres / (unit === 'cm' ? 10 : 25.4)).toFixed(1));
};
