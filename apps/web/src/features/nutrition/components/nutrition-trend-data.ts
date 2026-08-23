import { addChartCalendarDays, type DashboardMacrosTrendPoint } from '@pulse/shared';

export type NutritionTrendChartPoint = {
  date: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type MacroAverages = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function buildNutritionTrendData(
  points: DashboardMacrosTrendPoint[] | undefined,
  from: string,
  to: string,
): NutritionTrendChartPoint[] {
  const pointsByDate = new Map((points ?? []).map((point) => [point.date, point]));
  const rows: NutritionTrendChartPoint[] = [];
  for (let date = from; date <= to; date = addChartCalendarDays(date, 1)) {
    const point = pointsByDate.get(date) ?? null;
    rows.push({
      date,
      calories: point?.calories ?? null,
      protein: point?.protein ?? null,
      carbs: point?.carbs ?? null,
      fat: point?.fat ?? null,
    });
  }
  return rows;
}

export function computeNutritionDailyAverages(
  points: DashboardMacrosTrendPoint[] | undefined,
): MacroAverages | null {
  const entries = points ?? [];
  if (entries.length === 0) return null;

  const totals = entries.reduce(
    (sum, point) => ({
      calories: sum.calories + point.calories,
      protein: sum.protein + point.protein,
      carbs: sum.carbs + point.carbs,
      fat: sum.fat + point.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return {
    calories: totals.calories / entries.length,
    protein: totals.protein / entries.length,
    carbs: totals.carbs / entries.length,
    fat: totals.fat / entries.length,
  };
}
