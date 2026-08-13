import type { NutritionLogStatus } from '@pulse/shared';
import { CheckCircle2, CircleHelp, CircleSlash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { cn } from '@/lib/utils';
import { useUpdateNutritionStatus } from '@/features/nutrition/api/nutrition';

const statusOptions = [
  {
    value: 'unknown' as const,
    label: 'Unknown',
    description: 'Not confirmed',
    icon: CircleHelp,
  },
  {
    value: 'partial' as const,
    label: 'Partial',
    description: 'Something is missing',
    icon: CircleSlash2,
  },
  {
    value: 'complete' as const,
    label: 'Complete',
    description: 'All intake is logged',
    icon: CheckCircle2,
  },
] as const;

type NutritionDayStatusControlProps = {
  date: string;
  isToday: boolean;
  status: NutritionLogStatus | null;
};

export function NutritionDayStatusControl({
  date,
  isToday,
  status,
}: NutritionDayStatusControlProps) {
  const mutation = useUpdateNutritionStatus();
  const { confirm, dialog } = useConfirmation();
  const hasLog = status !== null;

  const updateStatus = async (nextStatus: NutritionLogStatus) => {
    if (!hasLog || nextStatus === status) {
      return;
    }

    await mutation.mutateAsync({ date, status: nextStatus });
  };

  const chooseStatus = (nextStatus: NutritionLogStatus) => {
    if (nextStatus === 'complete' && isToday) {
      confirm({
        title: 'Mark today complete?',
        description:
          'Only confirm after every calorie-containing item is logged. Any later meal change will automatically return today to Partial.',
        confirmLabel: 'Mark complete',
        variant: 'default',
        onConfirm: () => updateStatus(nextStatus),
      });
      return;
    }

    void updateStatus(nextStatus);
  };

  return (
    <section
      aria-labelledby="nutrition-day-status-heading"
      className="rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm sm:px-5"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-base font-semibold" id="nutrition-day-status-heading">
            Is this day fully logged?
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Estimated restaurant meals are fine; omitted meals are not. Only Complete days can train
            your Adaptive TDEE.
          </p>
        </div>
        {status ? (
          <p
            aria-live="polite"
            className="text-xs font-medium uppercase tracking-[0.14em] text-primary"
          >
            {status}
          </p>
        ) : null}
      </div>

      <div
        aria-label="Nutrition day completeness"
        className="mt-3 grid gap-2 sm:grid-cols-3"
        role="group"
      >
        {statusOptions.map((option) => {
          const Icon = option.icon;
          const isActive = status === option.value;
          return (
            <Button
              aria-pressed={isActive}
              className={cn(
                'h-auto min-h-11 justify-start px-3 py-2.5 text-left',
                isActive && 'border-primary bg-primary/10 text-foreground',
              )}
              disabled={!hasLog || mutation.isPending}
              key={option.value}
              onClick={() => chooseStatus(option.value)}
              type="button"
              variant="outline"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </Button>
          );
        })}
      </div>

      {!hasLog ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Log at least one meal before setting a completion status.
        </p>
      ) : null}
      {mutation.isError ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {mutation.error instanceof Error
            ? mutation.error.message
            : 'Unable to update this day. Please try again.'}
        </p>
      ) : null}
      {dialog}
    </section>
  );
}
