import { useId, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  calculateMacroTotals,
  formatCalories,
  formatDisplayServing,
  formatGrams,
} from '@/features/nutrition/lib/nutrition-utils';

export type MealCardMeal = {
  id: string;
  name: string;
  summary: string | null;
  time: string | null;
  items: Array<{
    id: string;
    name: string;
    amount: number;
    unit: string;
    displayQuantity?: number | null;
    displayUnit?: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>;
};

type MealCardProps = {
  meal: MealCardMeal;
  onDelete?: (mealId: string) => void;
  isDeleting?: boolean;
};

const ITEM_HEADER_LABELS = [
  { key: 'calories', label: 'Calories' },
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
] as const;
const CARD_HORIZONTAL_PADDING = 'px-4 sm:px-5';

export function MealCard({ meal, onDelete, isDeleting = false }: MealCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const totals = calculateMacroTotals(meal.items);
  const formattedTime = formatMealTime(meal.time);
  const canDelete = typeof onDelete === 'function';

  return (
    <Card className="gap-0 overflow-hidden border-border bg-[var(--color-card)] py-0 shadow-none">
      <div className={cn('flex items-start gap-3 py-4', CARD_HORIZONTAL_PADDING)}>
        <button
          aria-controls={contentId}
          aria-expanded={isExpanded}
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-4 text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">{meal.name}</h2>
              <p className="text-sm text-muted">{formattedTime}</p>
              {!isExpanded && meal.summary ? (
                <p className="truncate text-sm text-muted">{meal.summary}</p>
              ) : null}
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

        {canDelete ? (
          <Button
            aria-label={`Delete ${meal.name}`}
            className="shrink-0"
            disabled={isDeleting}
            onClick={() => onDelete(meal.id)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>

      {isExpanded ? (
        <div
          className={cn('border-t border-border/80 py-4', CARD_HORIZONTAL_PADDING)}
          id={contentId}
        >
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
                  <p className="text-sm text-muted">{formatDisplayServing(item)}</p>
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

function formatMealTime(time: string | null) {
  if (!time) {
    return 'Time not set';
  }

  const [rawHours, rawMinutes] = time.split(':');
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return time;
  }

  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const normalizedHours = hours % 12 || 12;

  return `${normalizedHours}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}
