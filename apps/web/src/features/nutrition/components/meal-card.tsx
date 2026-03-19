import { useId, useRef, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  onRename?: (mealId: string, name: string) => void;
  isDeleting?: boolean;
  isRenaming?: boolean;
};

const CARD_HORIZONTAL_PADDING = 'px-4 sm:px-5';

export function MealCard({
  meal,
  onDelete,
  onRename,
  isDeleting = false,
  isRenaming = false,
}: MealCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(meal.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const contentId = useId();
  const skipBlurCommitRef = useRef(false);
  const formattedTime = formatMealTime(meal.time);
  const collapsedSummary = formatCollapsedSummary(meal);
  const totals = meal.items.length > 0 ? calculateMacroTotals(meal.items) : null;
  const canDelete = typeof onDelete === 'function';
  const canRename = typeof onRename === 'function';

  function beginNameEdit() {
    if (!canRename || isRenaming) {
      return;
    }

    setIsEditingName(true);
    setNameDraft(meal.name);
    setNameError(null);
  }

  function cancelNameEdit() {
    setIsEditingName(false);
    setNameDraft(meal.name);
    setNameError(null);
  }

  function commitNameEdit() {
    const nextName = nameDraft.trim();
    const currentName = meal.name.trim();

    if (!nextName) {
      setNameError('Meal name is required');
      return false;
    }

    if (nextName === currentName) {
      cancelNameEdit();
      return true;
    }

    onRename?.(meal.id, nextName);
    setIsEditingName(false);
    setNameError(null);
    return true;
  }

  return (
    <Card className="gap-0 overflow-hidden rounded-xl border-border/70 bg-[var(--color-card)] py-0 shadow-none">
      <div
        aria-controls={contentId}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${meal.name}`}
        className={cn('flex cursor-pointer items-start gap-2 py-3', CARD_HORIZONTAL_PADDING)}
        onClick={() => setIsExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">
              {isEditingName ? (
                <Input
                  aria-invalid={Boolean(nameError)}
                  aria-label={`Meal name for ${meal.name}`}
                  autoFocus
                  className="h-8 max-w-56 text-sm sm:max-w-64"
                  disabled={isRenaming}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => {
                    if (skipBlurCommitRef.current) {
                      skipBlurCommitRef.current = false;
                      return;
                    }

                    commitNameEdit();
                  }}
                  onChange={(event) => {
                    setNameDraft(event.target.value);
                    if (nameError) {
                      setNameError(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      skipBlurCommitRef.current = true;
                      event.preventDefault();
                      cancelNameEdit();
                      return;
                    }

                    if (event.key === 'Enter') {
                      skipBlurCommitRef.current = true;
                      event.preventDefault();
                      commitNameEdit();
                    }
                  }}
                  readOnly={isRenaming}
                  value={nameDraft}
                />
              ) : (
                <button
                  aria-label={`Rename ${meal.name}`}
                  className="max-w-full cursor-text truncate text-left transition-colors hover:text-primary"
                  disabled={!canRename || isRenaming}
                  onClick={(e) => {
                    e.stopPropagation();
                    beginNameEdit();
                  }}
                  type="button"
                >
                  {meal.name}
                </button>
              )}
            </h2>
            <span className="shrink-0 text-[11px] text-muted">{formattedTime}</span>
          </div>
          {nameError ? <p className="mt-1 text-xs text-destructive">{nameError}</p> : null}
          <p className="mt-0.5 truncate text-xs text-muted">{collapsedSummary}</p>
          {totals ? (
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span className="font-semibold text-foreground">
                {formatCalories(totals.calories, { compact: true })}
              </span>
              <span>{formatGrams(totals.protein, { compact: true, suffix: 'P' })}</span>
              <span>{formatGrams(totals.carbs, { compact: true, suffix: 'C' })}</span>
              <span>{formatGrams(totals.fat, { compact: true, suffix: 'F' })}</span>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="flex shrink-0 items-center px-2.5">
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-4 text-muted transition-transform duration-200',
                isExpanded && 'rotate-180',
              )}
            />
          </span>
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
        </div>
      </div>

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
