import {
  formatCalories as formatCaloriesValue,
  formatGrams as formatGramsValue,
  formatServing as formatServingValue,
} from '@/lib/format-utils';

export type MacroTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};
export type MacroKey = keyof MacroTotals;

type MacroSource = Pick<MacroTotals, MacroKey>;
type MealSource = {
  items: MacroSource[];
};

type ServingSource = {
  amount: number;
  unit: string;
  displayQuantity?: number | null;
  displayUnit?: string | null;
};

const DEFAULT_TOTALS: MacroTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
};

export function calculateMacroTotals(sources: Array<MacroSource | MealSource>): MacroTotals {
  return sources.reduce<MacroTotals>((totals, source) => {
    const macrosToAdd = 'items' in source ? calculateMacroTotals(source.items) : source;

    return {
      calories: totals.calories + macrosToAdd.calories,
      protein: totals.protein + macrosToAdd.protein,
      carbs: totals.carbs + macrosToAdd.carbs,
      fat: totals.fat + macrosToAdd.fat,
    };
  }, DEFAULT_TOTALS);
}

function getMealSortIndex(name: string) {
  const normalizedName = name.trim().toLowerCase();

  switch (normalizedName) {
    case 'breakfast':
      return 0;
    case 'lunch':
      return 1;
    case 'dinner':
      return 2;
    case 'snacks':
      return 3;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

export function sortMeals<T extends { name: string }>(meals: T[]): T[] {
  return [...meals].sort((left, right) => {
    const orderDifference = getMealSortIndex(left.name) - getMealSortIndex(right.name);

    if (orderDifference !== 0) {
      return orderDifference;
    }

    return left.name.localeCompare(right.name);
  });
}

export function formatCalories(value: number): string {
  return `${formatCaloriesValue(value)} cal`;
}

export function formatGrams(value: number): string {
  return formatGramsValue(value);
}

export function formatDisplayServing({
  amount,
  unit,
  displayQuantity,
  displayUnit,
}: ServingSource): string {
  const normalizedDisplayUnit = displayUnit?.trim();
  const hasDisplayServing =
    typeof displayQuantity === 'number' &&
    Number.isFinite(displayQuantity) &&
    displayQuantity > 0 &&
    Boolean(normalizedDisplayUnit);

  if (hasDisplayServing) {
    return `${formatServingValue(displayQuantity)} ${normalizedDisplayUnit}`;
  }

  return `${formatServingValue(amount)} ${unit}`;
}

export function formatServing(item: ServingSource): string {
  return formatDisplayServing(item);
}

export function formatDayLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
}

export function formatCompactDayLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(startOfDay(date));
}

export function formatDateKey(date: Date): string {
  const normalizedDate = startOfDay(date);
  const year = normalizedDate.getFullYear();
  const month = `${normalizedDate.getMonth() + 1}`.padStart(2, '0');
  const day = `${normalizedDate.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, amount: number): Date {
  const nextDate = startOfDay(date);
  nextDate.setDate(nextDate.getDate() + amount);

  return nextDate;
}

export function isSameDay(left: Date, right: Date): boolean {
  return formatDateKey(left) === formatDateKey(right);
}

export function startOfDay(date: Date): Date {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);

  return normalizedDate;
}
