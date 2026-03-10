import type { WeightUnit } from '../schemas/users.js';

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

export function getWeightLabel(unit: WeightUnit): string {
  return unit;
}
