import type { AdaptiveCheckInSummary, AdaptiveGoal, AdaptiveGoalProgress } from '@pulse/shared';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useState, type RefObject } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { ApiError } from '@/lib/api-client';

import { useCompleteAdaptiveGoal } from '../api/adaptive-nutrition';
import { formatAdaptiveDate, formatAdaptiveWeight } from '../lib/format-adaptive-nutrition';

export function GoalCompletionDialog({
  checkIn,
  goal,
  onCompleted,
  onOpenChange,
  onRefresh,
  open,
  progress,
  revisionId,
  triggerRef,
}: {
  checkIn: AdaptiveCheckInSummary | null;
  goal: AdaptiveGoal;
  onCompleted: (message: string) => void;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
  open: boolean;
  progress: AdaptiveGoalProgress | null;
  revisionId: string | null;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { weightUnit } = useWeightUnit();
  const mutation = useCompleteAdaptiveGoal();
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);
  const completedTarget = goal.targetWeightKg;
  const finalTrend = progress?.currentTrendWeightKg ?? null;
  const totalChange = finalTrend === null ? null : finalTrend - goal.startTrendWeightKg;

  const complete = async () => {
    if (!checkIn || !revisionId) return;
    setError(null);
    try {
      const result = await mutation.mutateAsync({
        id: goal.id,
        input: { checkInId: checkIn.id, expectedRevisionId: revisionId },
      });
      onCompleted(
        `Goal completed. Maintenance is now centered at ${formatAdaptiveWeight(result.goal.maintenanceCenterKg, weightUnit)}; your accepted target and history were preserved.`,
      );
      onOpenChange(false);
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        (caught.code === 'CHECKIN_STALE' ||
          caught.code === 'GOAL_REVISION_CONFLICT' ||
          caught.code === 'GOAL_COMPLETION_NOT_READY')
      ) {
        setError({
          message:
            'This completion review is out of date. Pulse kept your current goal and targets unchanged. Refresh the Coach state, then review again.',
          stale: true,
        });
      } else {
        setError({
          message:
            caught instanceof Error
              ? caught.message
              : 'Unable to complete this goal. Nothing changed; try again.',
          stale: false,
        });
      }
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent
        className="sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 aria-hidden="true" className="size-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              Trend-confirmed progress
            </span>
          </div>
          <DialogTitle>Review goal completion</DialogTitle>
          <DialogDescription>
            Your accepted nutrition target is already in place. This separate step closes the goal
            and starts maintenance without resetting Adaptive TDEE, weight, nutrition, or check-in
            history.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2 sm:grid-cols-2">
          <CompletionMetric
            label="Completed target"
            value={formatAdaptiveWeight(completedTarget, weightUnit)}
          />
          <CompletionMetric
            label="Final trend weight"
            value={formatAdaptiveWeight(finalTrend, weightUnit)}
          />
          <CompletionMetric
            label="Total trend change"
            value={formatSignedWeight(totalChange, weightUnit)}
          />
          <CompletionMetric
            label="Goal period"
            value={`${formatAdaptiveDate(goal.startedLocalDate)} – today`}
          />
        </dl>
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
          <h3 className="text-sm font-semibold">Maintenance transition</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Maintenance will center on {formatAdaptiveWeight(completedTarget, weightUnit)}. This
            will not create or replace another nutrition target.
          </p>
        </div>
        <details className="rounded-xl border border-border/70 p-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">
            Review completion evidence
          </summary>
          <div className="space-y-2 pb-1 text-sm text-muted-foreground">
            <p>
              Progress began from a canonical trend weight of{' '}
              {formatAdaptiveWeight(goal.startTrendWeightKg, weightUnit)}.
            </p>
            <p>
              The accepted {checkIn?.kind === 'weekly' ? 'weekly' : 'manual'} check-in from{' '}
              {formatAdaptiveDate(checkIn?.localDate)} is linked to this goal and revision.
            </p>
            <p>Pulse rechecks the trend tolerance and source fingerprint when you confirm.</p>
          </div>
        </details>
        {error ? (
          <p
            className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive"
            role="alert"
          >
            {error.message}
          </p>
        ) : null}
        <DialogFooter>
          {error?.stale ? (
            <Button
              disabled={mutation.isPending}
              onClick={() => {
                void onRefresh().then(() => {
                  setError(null);
                  onOpenChange(false);
                });
              }}
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" /> Refresh Coach state
            </Button>
          ) : error ? (
            <Button
              disabled={mutation.isPending}
              onClick={() => void complete()}
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" /> Retry completion
            </Button>
          ) : null}
          <Button
            disabled={!checkIn || !revisionId || mutation.isPending || error?.stale}
            onClick={() => void complete()}
            type="button"
          >
            {mutation.isPending ? 'Moving to maintenance…' : 'Move to maintenance'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompletionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/20 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function formatSignedWeight(valueKg: number | null, unit: 'kg' | 'lbs') {
  if (valueKg === null) return '—';
  const value = formatAdaptiveWeight(Math.abs(valueKg), unit);
  return `${valueKg > 0 ? '+' : valueKg < 0 ? '−' : ''}${value}`;
}
