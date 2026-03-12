type CaloriesUnit = 'none' | 'cal' | 'kcal';
type WeightUnit = 'none' | 'lbs';

function normalizeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function formatCalories(value: number, unit: CaloriesUnit = 'none'): string {
  const rounded = `${Math.round(normalizeNumber(value))}`;

  if (unit === 'none') {
    return rounded;
  }

  return `${rounded} ${unit}`;
}

export function formatGrams(value: number): string {
  return `${Math.round(normalizeNumber(value))}g`;
}

export function formatWeight(value: number, unit: WeightUnit = 'none'): string {
  const rounded = Math.round(normalizeNumber(value) * 10) / 10;
  const formatted = rounded.toFixed(1);

  if (unit === 'none') {
    return formatted;
  }

  return `${formatted} ${unit}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(normalizeNumber(value))}%`;
}

export function formatTrendChange(value: number): string {
  const rounded = Math.round(normalizeNumber(value) * 10) / 10;
  return rounded.toFixed(1);
}

export function formatServing(value: number): string {
  return normalizeNumber(value)
    .toFixed(2)
    .replace(/\.?0+$/, '');
}
