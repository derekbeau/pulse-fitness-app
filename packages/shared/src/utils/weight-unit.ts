import type { WeightUnit } from '../schemas/users.js';

export function formatWeight(value: number, unit: WeightUnit): string {
  return `${value} ${unit}`;
}
