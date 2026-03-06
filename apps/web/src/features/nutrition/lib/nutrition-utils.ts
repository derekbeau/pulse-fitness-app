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
    if ('items' in source) {
      const mealTotals = calculateMacroTotals(source.items);

      return {
        calories: totals.calories + mealTotals.calories,
        protein: totals.protein + mealTotals.protein,
        carbs: totals.carbs + mealTotals.carbs,
        fat: totals.fat + mealTotals.fat,
      };
    }

    return {
      calories: totals.calories + source.calories,
      protein: totals.protein + source.protein,
      carbs: totals.carbs + source.carbs,
      fat: totals.fat + source.fat,
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

function formatNumber(value: number): string {
  const rounded = Number(value.toFixed(2));

  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
}
