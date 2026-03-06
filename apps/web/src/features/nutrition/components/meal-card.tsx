import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Meal } from '@/lib/mock-data/nutrition';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  calculateMacroTotals,
  formatCalories,
  formatGrams,
  formatServing,
} from '@/features/nutrition/lib/nutrition-utils';

type MealCardProps = {
  meal: Meal;
};

const ITEM_HEADER_LABELS = [
  { key: 'calories', label: 'Calories' },
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
] as const;

export function MealCard({ meal }: MealCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const totals = calculateMacroTotals(meal.items);

  return (
    <Card className="gap-0 overflow-hidden border-border bg-[var(--color-card)] py-0 shadow-none">
      <button
        aria-controls={contentId}
        aria-expanded={isExpanded}
        className="flex w-full cursor-pointer flex-col gap-4 px-5 py-4 text-left transition-colors hover:bg-secondary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{meal.name}</h2>
            <p className="text-sm text-muted">{meal.time}</p>
          </div>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'mt-0.5 size-5 shrink-0 text-muted transition-transform duration-200',
              isExpanded && 'rotate-180',
            )}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold tracking-tight text-foreground">
            {formatCalories(totals.calories)}
          </span>
          <span className="text-muted">{formatGrams(totals.protein)} protein</span>
          <span className="text-muted">{formatGrams(totals.carbs)} carbs</span>
          <span className="text-muted">{formatGrams(totals.fat)} fat</span>
        </div>
      </button>

      {isExpanded ? (
        <div className="border-t border-border/80 px-5 py-4" id={contentId}>
          <div className="hidden grid-cols-[minmax(0,1.8fr)_repeat(4,minmax(0,0.7fr))] gap-3 px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted sm:grid">
            <span>Food</span>
            {ITEM_HEADER_LABELS.map((column) => (
              <span key={column.key} className="text-right">
                {column.label}
              </span>
            ))}
          </div>

          <ul className="overflow-hidden rounded-lg border border-border/70 bg-secondary/10">
            {meal.items.map((item, index) => (
              <li
                key={item.id}
                className={cn(
                  'grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1.8fr)_repeat(4,minmax(0,0.7fr))] sm:items-center',
                  index > 0 && 'border-t border-border/70',
                  index % 2 === 1 && 'bg-secondary/15',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{item.name}</p>
                  <p className="text-sm text-muted">{formatServing(item)}</p>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:contents">
                  <MacroCell label="Calories" value={formatCalories(item.calories)} />
                  <MacroCell label="Protein" value={formatGrams(item.protein)} />
                  <MacroCell label="Carbs" value={formatGrams(item.carbs)} />
                  <MacroCell label="Fat" value={formatGrams(item.fat)} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

type MacroCellProps = {
  label: string;
  value: string;
};

function MacroCell({ label, value }: MacroCellProps) {
  return (
    <div className="sm:text-right">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted sm:hidden">
        {label}
      </p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
