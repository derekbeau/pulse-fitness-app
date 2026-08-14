import type { AdaptiveCheckInDetail } from '@pulse/shared';
import { ArrowRight, Check, RotateCcw, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import {
  adaptiveReasonCopy,
  formatAdaptiveCalories,
  formatAdaptiveDifference,
  formatAdaptiveGrams,
} from '../lib/format-adaptive-nutrition';
import { CheckInDataDetails } from './check-in-data-details';

type CheckInComparisonProps = {
  checkIn: AdaptiveCheckInDetail;
  errorMessage?: string | null;
  isAccepting?: boolean;
  isDeclining?: boolean;
  isRefreshing?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onRefresh?: () => void;
};

export function CheckInComparison({
  checkIn,
  errorMessage,
  isAccepting = false,
  isDeclining = false,
  isRefreshing = false,
  onAccept,
  onDecline,
  onRefresh,
}: CheckInComparisonProps) {
  const isStale = Boolean(onRefresh);
  const current = checkIn.currentTargets;
  const proposed = checkIn.proposedTargets;
  const isGoalChange = checkIn.kind === 'goal_change';

  return (
    <Card className="gap-5 border-primary/30 py-5 shadow-[0_18px_60px_-42px_var(--color-primary)]">
      <CardHeader className="gap-2 px-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>
            {checkIn.kind === 'baseline'
              ? 'Starting plan'
              : isGoalChange
                ? 'Goal update'
                : 'Recommendation'}
          </Badge>
          {checkIn.reasonCodes.includes('GOAL_REACHED') ? (
            <Badge variant="outline">Goal reached</Badge>
          ) : null}
        </div>
        <CardTitle className="text-xl">
          <h2>Current and proposed targets</h2>
        </CardTitle>
        <CardDescription>
          {isGoalChange
            ? 'Your goal changed. Your current nutrition targets stay in place until you accept this recommendation.'
            : 'Nothing changes until you accept. Keeping current targets preserves your existing plan.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-5 sm:px-6">
        <div aria-label="Recommendation comparison" className="space-y-2">
          <ComparisonRow
            current={formatAdaptiveCalories(checkIn.priorTdeeKcal)}
            difference={formatAdaptiveDifference(
              checkIn.proposedTdeeKcal,
              checkIn.priorTdeeKcal,
              'kcal',
            )}
            label="Adaptive TDEE"
            proposed={formatAdaptiveCalories(checkIn.proposedTdeeKcal)}
          />
          <ComparisonRow
            current={formatAdaptiveCalories(current?.calories)}
            difference={formatAdaptiveDifference(proposed?.calories, current?.calories, 'kcal')}
            label="Calories"
            proposed={formatAdaptiveCalories(proposed?.calories)}
          />
          <ComparisonRow
            current={formatAdaptiveGrams(current?.protein)}
            difference={formatAdaptiveDifference(proposed?.protein, current?.protein, 'g')}
            label="Protein"
            proposed={formatAdaptiveGrams(proposed?.protein)}
          />
          <ComparisonRow
            current={formatAdaptiveGrams(current?.carbs)}
            difference={formatAdaptiveDifference(proposed?.carbs, current?.carbs, 'g')}
            label="Carbohydrates"
            proposed={formatAdaptiveGrams(proposed?.carbs)}
          />
          <ComparisonRow
            current={formatAdaptiveGrams(current?.fat)}
            difference={formatAdaptiveDifference(proposed?.fat, current?.fat, 'g')}
            label="Fat"
            proposed={formatAdaptiveGrams(proposed?.fat)}
          />
        </div>

        {isGoalChange ? (
          <div
            aria-label="Recommendation attribution"
            className="rounded-xl border border-border/70 p-4"
          >
            <h3 className="text-sm font-semibold">What changed this recommendation</h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <AttributionItem
                label="Expenditure"
                value={formatAdaptiveDifference(
                  checkIn.proposedTdeeKcal,
                  checkIn.priorTdeeKcal,
                  'kcal',
                )}
              />
              <AttributionItem label="Goal strategy" value="Updated goal, target, or pace" />
              <AttributionItem
                label="Guardrails"
                value={
                  checkIn.reasonCodes.some((code) =>
                    ['CALORIE_FLOOR_APPLIED', 'DEFICIT_LIMIT_APPLIED'].includes(code),
                  )
                    ? 'Applied to the proposed calories'
                    : 'No additional limit applied'
                }
              />
              <AttributionItem label="Macro preferences" value="Preserved from your program" />
            </dl>
          </div>
        ) : null}

        {checkIn.reasonCodes.length ? (
          <div className="flex flex-wrap gap-2" aria-label="Recommendation notes">
            {checkIn.reasonCodes.map((code) => (
              <Badge key={code} variant="outline">
                {adaptiveReasonCopy[code].label}
              </Badge>
            ))}
          </div>
        ) : null}

        <CheckInDataDetails checkIn={checkIn} />

        {errorMessage ? (
          <div
            aria-live="polite"
            className="rounded-xl border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive"
            role="alert"
          >
            <p>{errorMessage}</p>
            {isStale ? (
              <Button
                className="mt-3"
                disabled={isRefreshing}
                onClick={onRefresh}
                type="button"
                variant="outline"
              >
                <RotateCcw aria-hidden="true" />
                {isRefreshing ? 'Refreshing…' : 'Refresh recommendation'}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2" aria-label="Recommendation actions">
          <Button
            className="min-h-11 w-full"
            disabled={isAccepting || isDeclining || !proposed}
            onClick={onAccept}
            type="button"
          >
            <Check aria-hidden="true" />
            {isAccepting ? 'Applying targets…' : 'Use these targets'}
          </Button>
          <Button
            className="min-h-11 w-full"
            disabled={isAccepting || isDeclining}
            onClick={onDecline}
            type="button"
            variant="outline"
          >
            <X aria-hidden="true" />
            {isDeclining ? 'Keeping current…' : 'Keep current'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AttributionItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function ComparisonRow({
  current,
  difference,
  label,
  proposed,
}: {
  current: string;
  difference: string;
  label: string;
  proposed: string;
}) {
  return (
    <div className="grid gap-2 rounded-xl border border-border/70 bg-background/60 p-3 sm:grid-cols-[minmax(8rem,1fr)_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-3">
      <p className="text-sm font-semibold">{label}</p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:contents">
        <ValueBlock label="Current" value={current} />
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <ValueBlock label="Proposed" value={proposed} />
      </div>
      <p className="text-xs font-medium text-primary sm:col-start-4 sm:row-start-2 sm:text-right">
        {difference}
      </p>
    </div>
  );
}

function ValueBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}
