import type { WeightUnit } from '../schemas/users.js';

export const POUNDS_TO_KILOGRAMS = 0.45359237;
export const MIN_BODY_WEIGHT_KG = 25;
export const MAX_BODY_WEIGHT_KG = 350;

const integerFormatter = new Intl.NumberFormat('en-US');
const decimalFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

function formatNumber(value: number) {
  return Number.isInteger(value) ? integerFormatter.format(value) : decimalFormatter.format(value);
}

export function formatWeight(value: number, unit: WeightUnit): string {
  return `${formatNumber(value)} ${unit}`;
}

export function convertWeightToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * POUNDS_TO_KILOGRAMS;
}

export function convertWeightFromKg(weightKg: number, unit: WeightUnit): number {
  return unit === 'kg' ? weightKg : weightKg / POUNDS_TO_KILOGRAMS;
}

export function isCanonicalBodyWeight(weightKg: number): boolean {
  return (
    Number.isFinite(weightKg) && weightKg >= MIN_BODY_WEIGHT_KG && weightKg <= MAX_BODY_WEIGHT_KG
  );
}
