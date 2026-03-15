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

type CaloriesFormatOptions = {
  compact?: boolean;
};

type GramsFormatOptions = {
  compact?: boolean;
  suffix?: string;
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

export type MealSortDirection = 'asc' | 'desc';

function toTimestamp(value: number | string | Date): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsedTimestamp = new Date(value).getTime();
  return Number.isNaN(parsedTimestamp) ? 0 : parsedTimestamp;
}

export function sortMeals<T extends { loggedAt: number | string | Date }>(
  meals: T[],
  direction: MealSortDirection = 'asc',
  tieBreaker?: (meal: T) => string,
): T[] {
  return [...meals].sort((left, right) => {
    const leftTimestamp = toTimestamp(left.loggedAt);
    const rightTimestamp = toTimestamp(right.loggedAt);
    const orderDifference = leftTimestamp - rightTimestamp;

    if (orderDifference !== 0) {
      return direction === 'asc' ? orderDifference : -orderDifference;
    }

    if (!tieBreaker) {
      return 0;
    }

    return direction === 'asc'
      ? tieBreaker(left).localeCompare(tieBreaker(right))
      : tieBreaker(right).localeCompare(tieBreaker(left));
  });
}

export function toMealLoggedAtTimestamp(
  dateKey: string,
  mealTime: string | null,
  fallbackTimestamp: number,
): number {
  if (mealTime) {
    // Parse as local wall-clock time because meal times are user-entered local intent.
    const parsedTime = new Date(`${dateKey}T${mealTime}:00`).getTime();
    if (!Number.isNaN(parsedTime)) {
      return parsedTime;
    }
  }

  return fallbackTimestamp;
}

export function formatCalories(value: number, options: CaloriesFormatOptions = {}): string {
  const rounded = formatCaloriesValue(value);

  return options.compact ? `${rounded}cal` : `${rounded} cal`;
}

export function formatGrams(value: number, options: GramsFormatOptions = {}): string {
  const rounded = formatCaloriesValue(value);

  if (options.compact) {
    return `${rounded}${options.suffix ?? 'g'}`;
  }

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
