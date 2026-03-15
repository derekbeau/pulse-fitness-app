import { Trash2 } from 'lucide-react';

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

const CARD_HORIZONTAL_PADDING = 'px-4 sm:px-5';

export function MealCard({ meal, onDelete, isDeleting = false }: MealCardProps) {
  const totals = calculateMacroTotals(meal.items);
  const formattedTime = formatMealTime(meal.time);
  const canDelete = typeof onDelete === 'function';
  const mealMetadata = [formattedTime, formatFoodCount(meal.items.length)].filter(Boolean).join(' · ');

  return (
    <Card className="gap-0 overflow-hidden rounded-xl border-border/70 bg-[var(--color-card)] py-0 shadow-none">
      <div className={cn('flex min-h-11 items-start gap-2 py-2.5', CARD_HORIZONTAL_PADDING)}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-base font-semibold text-foreground sm:text-[17px]">{meal.name}</h2>
            <p className="text-[11px] font-medium tracking-tight text-muted sm:text-xs">
              {formatMacroSummary(totals)}
            </p>
          </div>
          <p className="mt-0.5 text-[11px] text-muted sm:text-xs">{mealMetadata}</p>
        </div>

        {canDelete ? (
          <Button
            aria-label={`Delete ${meal.name}`}
            className="shrink-0 px-2.5 text-muted hover:text-foreground"
            disabled={isDeleting}
            onClick={() => onDelete(meal.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      {meal.items.length > 0 ? (
        <ul className="border-t border-border/70 bg-secondary/10">
          {meal.items.map((item, index) => (
            <li
              key={item.id}
              className={cn(
                CARD_HORIZONTAL_PADDING,
                'min-h-11 py-2',
                index > 0 && 'border-t border-border/60',
                index % 2 === 1 && 'bg-secondary/15',
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-foreground">{item.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] text-muted sm:text-xs">
                  <span>{formatDisplayServing(item)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatMacroSummary(item)}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
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

function formatFoodCount(count: number) {
  return `${count} ${count === 1 ? 'food' : 'foods'}`;
}

function formatMacroSummary(macros: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}) {
  return [
    formatCalories(macros.calories, { compact: true }),
    formatGrams(macros.protein, { compact: true, suffix: 'P' }),
    formatGrams(macros.carbs, { compact: true, suffix: 'C' }),
    formatGrams(macros.fat, { compact: true, suffix: 'F' }),
  ].join(' · ');
}
