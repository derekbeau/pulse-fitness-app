import { MealCard } from '@/features/nutrition';
import {
  calculateMacroTotals,
  formatCalories,
  formatDayLabel,
  formatGrams,
  sortMeals,
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

const selectedDate = Object.keys(mockDailyMeals).sort().at(-1);
const selectedMeals = selectedDate ? sortMeals(mockDailyMeals[selectedDate]) : [];
const dailyTotals = calculateMacroTotals(selectedMeals);

export function NutritionPage() {
  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-primary">Nutrition</h1>
        <p className="max-w-2xl text-sm text-muted">
          Agent-logged meals for {selectedDate ? formatDayLabel(selectedDate) : 'the selected day'}.
        </p>
      </header>

      <section
        aria-label="Daily macro totals"
        className="rounded-2xl border border-border/70 bg-[var(--color-accent-cream)] px-5 py-5 text-[var(--color-on-accent)] shadow-sm"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Daily totals</h2>
            <p
              className="text-sm"
              style={{ color: 'color-mix(in srgb, var(--color-on-accent) 68%, transparent)' }}
            >
              Actual intake against your daily macro targets.
            </p>
          </div>
          {selectedDate ? (
            <p
              className="text-sm font-medium"
              style={{ color: 'color-mix(in srgb, var(--color-on-accent) 72%, transparent)' }}
            >
              {formatDayLabel(selectedDate)}
            </p>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {MACRO_CONFIG.map((macro) => {
            const actual = dailyTotals[macro.key];
            const target = mockDailyTargets[macro.key];
            const isOverTarget = actual > target;

            return (
              <div
                key={macro.key}
                className="rounded-xl border border-black/8 bg-white/30 px-4 py-4 backdrop-blur-sm"
              >
                <p
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: 'color-mix(in srgb, var(--color-on-accent) 66%, transparent)' }}
                >
                  {macro.label}
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--color-on-accent)]">
                  <span
                    className={cn(
                      isOverTarget ? 'text-red-900' : 'text-emerald-950',
                      'text-lg tracking-tight',
                    )}
                  >
                    {macro.formatValue(actual)}
                  </span>
                  <span
                    style={{ color: 'color-mix(in srgb, var(--color-on-accent) 72%, transparent)' }}
                  >
                    {' '}
                    / {macro.formatValue(target)}
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="space-y-3">
        {selectedMeals.map((meal) => (
          <MealCard key={meal.id} meal={meal} />
        ))}
      </div>
    </section>
  );
}
