import { useState } from 'react';

import { DateNavBar, MealCard, NutritionMacroRings } from '@/features/nutrition';
import {
  formatDateKey,
  calculateMacroTotals,
  formatCalories,
  formatDayLabel,
  formatGrams,
  sortMeals,
  startOfDay,
  type MacroKey,
} from '@/features/nutrition/lib/nutrition-utils';
import { mockDailyMeals, mockDailyTargets } from '@/lib/mock-data/nutrition';
import { cn } from '@/lib/utils';

const MACRO_CONFIG: Array<{
  key: MacroKey;
  label: string;
  formatValue: (value: number) => string;
}> = [
  { key: 'calories', label: 'Calories', formatValue: formatCalories },
  { key: 'protein', label: 'Protein', formatValue: formatGrams },
  { key: 'carbs', label: 'Carbs', formatValue: formatGrams },
  { key: 'fat', label: 'Fat', formatValue: formatGrams },
];

const EMPTY_TOTALS = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
};

export function NutritionPage() {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const dateKey = formatDateKey(selectedDate);
  const selectedMeals = sortMeals(mockDailyMeals[dateKey] ?? []);
  const dailyTotals = selectedMeals.length > 0 ? calculateMacroTotals(selectedMeals) : EMPTY_TOTALS;

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-primary">Nutrition</h1>
        <p className="max-w-2xl text-sm text-muted">
          Agent-logged meals for {formatDayLabel(dateKey)}.
        </p>
      </header>

      <DateNavBar selectedDate={selectedDate} onDateChange={setSelectedDate} />

      <section
        aria-label="Daily macro totals"
        className="rounded-2xl border border-border/70 bg-[var(--color-accent-cream)] px-5 py-5 text-on-cream shadow-sm dark:border-l-4 dark:border-l-amber-500 dark:border-t-border/60 dark:border-r-border/60 dark:border-b-border/60 dark:bg-card dark:text-foreground"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Daily totals</h2>
            <p className="text-sm opacity-70 dark:text-muted dark:opacity-100">
              Actual intake against your daily macro targets.
            </p>
          </div>
          <p className="text-sm font-medium opacity-75 dark:text-muted dark:opacity-100">
            {formatDayLabel(dateKey)}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {MACRO_CONFIG.map((macro) => {
            const actual = dailyTotals[macro.key];
            const target = mockDailyTargets[macro.key];
            const isOverTarget = actual > target;

            return (
              <div
                key={macro.key}
                className="rounded-xl border border-black/8 bg-white/30 px-4 py-4 backdrop-blur-sm dark:border-border dark:bg-secondary/60"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-65 dark:text-muted dark:opacity-100">
                  {macro.label}
                </p>
                <p className="mt-2 text-sm font-semibold">
                  <span
                    className={cn(
                      isOverTarget
                        ? 'text-red-900 dark:text-red-400'
                        : 'text-emerald-950 dark:text-emerald-400',
                      'text-lg tracking-tight',
                    )}
                  >
                    {macro.formatValue(actual)}
                  </span>
                  <span className="opacity-70 dark:text-muted dark:opacity-100">
                    {' '}
                    / {macro.formatValue(target)}
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <NutritionMacroRings actuals={dailyTotals} targets={mockDailyTargets} />

      <div className="space-y-3">
        {selectedMeals.length > 0 ? (
          selectedMeals.map((meal) => <MealCard key={meal.id} meal={meal} />)
        ) : (
          <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/70 px-6 py-10 text-center shadow-sm">
            <p className="text-sm font-medium text-muted">No meals logged for this day</p>
          </div>
        )}
      </div>
    </section>
  );
}
