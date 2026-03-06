import type { DailyTargets, FoodItem, Meal } from '@/lib/mock-data/nutrition';

export const MEAL_ORDER = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const;

export type MacroKey = keyof DailyTargets;
export type MacroTotals = DailyTargets;

const DEFAULT_TOTALS: MacroTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
};

export function calculateMacroTotals(
  sources: Array<Pick<FoodItem, MacroKey>> | Meal[],
): MacroTotals {
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

export function sortMeals(meals: Meal[]): Meal[] {
  return [...meals].sort((left, right) => MEAL_ORDER.indexOf(left.name) - MEAL_ORDER.indexOf(right.name));
}

export function formatCalories(value: number): string {
  return `${Math.round(value)} cal`;
}

export function formatGrams(value: number): string {
  return `${Math.round(value)}g`;
}

export function formatServing(item: FoodItem): string {
  return `${formatNumber(item.quantity * item.servingSize)} ${item.servingUnit}`;
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

function formatNumber(value: number): string {
  const rounded = Number(value.toFixed(2));

  return `${rounded}`;
}
