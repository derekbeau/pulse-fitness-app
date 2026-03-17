import { useId, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
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
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const formattedTime = formatMealTime(meal.time);
  const collapsedSummary = formatCollapsedSummary(meal);
  const canDelete = typeof onDelete === 'function';

  return (
    <Card className="gap-0 overflow-hidden rounded-xl border-border/70 bg-[var(--color-card)] py-0 shadow-none">
      <button
        aria-controls={contentId}
        aria-expanded={isExpanded}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 py-3 text-left transition-colors hover:bg-secondary/30',
          CARD_HORIZONTAL_PADDING,
        )}
        onClick={() => setIsExpanded((prev) => !prev)}
        type="button"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{meal.name}</h2>
            <span className="shrink-0 text-[11px] text-muted">{formattedTime}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">{collapsedSummary}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {canDelete ? (
            <Button
              aria-label={`Delete ${meal.name}`}
              className="shrink-0 px-2.5 text-muted hover:text-foreground"
              disabled={isDeleting}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(meal.id);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-4 text-muted transition-transform duration-200',
              isExpanded && 'rotate-180',
            )}
          />
        </div>
      </button>

      {isExpanded ? (
        <div
          className={cn('border-t border-border/80 py-2', CARD_HORIZONTAL_PADDING)}
          id={contentId}
        >
          <ul className="divide-y divide-border/60">
            {meal.items.map((item) => (
              <li key={item.id} className="py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-foreground">
                    {item.name}
                  </p>
                  <span className="shrink-0 text-xs text-muted">{formatDisplayServing(item)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  <span className="font-semibold text-foreground">
                    {formatCalories(item.calories, { compact: true })}
                  </span>
                  <span>{formatGrams(item.protein, { compact: true, suffix: 'P' })}</span>
                  <span>{formatGrams(item.carbs, { compact: true, suffix: 'C' })}</span>
                  <span>{formatGrams(item.fat, { compact: true, suffix: 'F' })}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
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

function formatCollapsedSummary(meal: MealCardMeal) {
  const summary = meal.summary?.trim();
  if (summary) {
    return summary;
  }

  const itemNames = meal.items.map((item) => item.name.trim()).filter((name) => name.length > 0);
  if (itemNames.length > 0) {
    return itemNames.join(', ');
  }

  return 'No meal details available';
}
