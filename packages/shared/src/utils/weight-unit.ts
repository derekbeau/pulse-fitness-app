import type { WeightUnit } from '../schemas/users.js';

export function getWeightLabel(unit: WeightUnit): string {
  return unit;
}

export function formatWeight(value: number, unit: WeightUnit): string {
  return `${value} ${getWeightLabel(unit)}`;
}
