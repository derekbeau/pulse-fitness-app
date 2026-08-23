import { useState } from 'react';
import type {
  WorkoutProgressionActionType,
  WorkoutProgressionRecommendation,
  WorkoutProgressionTarget,
} from '@pulse/shared';
import { ArrowDown, ArrowRight, ArrowUp, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWeightUnit } from '@/hooks/use-weight-unit';

import { useApplyWorkoutProgressionAction, useWorkoutProgressionPreview } from '../api/progression';

type WorkoutProgressionReviewProps = {
  locked: boolean;
  scheduledWorkoutId: string;
};

const decisionMeta = {
  increase: { icon: ArrowUp, label: 'Increase' },
  hold: { icon: ArrowRight, label: 'Hold' },
  reduce: { icon: ArrowDown, label: 'Reduce' },
} as const;

function targetText(target: WorkoutProgressionTarget, weightUnit: string) {
  const parts: string[] = [];
  if (target.weight !== null) parts.push(`${target.weight} ${weightUnit}`);
  if (target.weightMin !== null || target.weightMax !== null) {
    parts.push(`${target.weightMin ?? '?'}–${target.weightMax ?? '?'} ${weightUnit}`);
  }
  if (target.reps !== null) parts.push(`${target.reps} reps`);
  else if (target.repsMin !== null || target.repsMax !== null) {
    parts.push(`${target.repsMin ?? '?'}–${target.repsMax ?? '?'} reps`);
  }
  if (target.seconds !== null) parts.push(`${target.seconds} sec`);
  if (target.distance !== null) parts.push(`${target.distance} distance`);
  if (target.zone !== null) parts.push(`Zone ${target.zone}`);
  return parts.join(' · ') || 'No measurable target';
}

export function WorkoutProgressionReview({
  locked,
  scheduledWorkoutId,
}: WorkoutProgressionReviewProps) {
  const preview = useWorkoutProgressionPreview(scheduledWorkoutId, !locked);
  const actionMutation = useApplyWorkoutProgressionAction(scheduledWorkoutId);
  const { weightUnit } = useWeightUnit();
  const [editing, setEditing] = useState<WorkoutProgressionRecommendation | null>(null);
  const [holding, setHolding] = useState<WorkoutProgressionRecommendation | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function act(
    recommendation: WorkoutProgressionRecommendation,
    action: WorkoutProgressionActionType,
    editedTargets: WorkoutProgressionTarget[] | null = null,
    reason: string | null = null,
  ) {
    setStatus(null);
    await actionMutation.mutateAsync({
      input: {
        action,
        editedTargets,
        expectedFingerprint: recommendation.sourceFingerprint,
        idempotencyKey: `web-${recommendation.id}-${action}`,
        reason,
      },
      recommendationId: recommendation.id,
    });
    setStatus(
      action === 'accept'
        ? `${recommendation.evidence.exerciseName} targets accepted.`
        : action === 'edit'
          ? `${recommendation.evidence.exerciseName} edited targets applied.`
          : action === 'keep'
            ? `${recommendation.evidence.exerciseName} current targets kept.`
            : `${recommendation.evidence.exerciseName} progression held.`,
    );
  }

  if (locked) return null;

  return (
    <section aria-labelledby="workout-progression-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Next-session coaching
          </p>
          <h2 className="mt-1 text-xl font-semibold" id="workout-progression-title">
            Progression review
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deterministic rules compare the last matching performance with this scheduled plan.
            Nothing changes until you choose an action.
          </p>
        </div>
        <Button
          aria-label="Recompute workout progression"
          className="min-h-11"
          disabled={preview.isFetching}
          onClick={() => void preview.refetch()}
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {preview.isFetching ? 'Checking…' : 'Recompute'}
        </Button>
      </div>

      {preview.isLoading ? (
        <Card role="status">
          <CardContent className="py-6 text-sm text-muted-foreground">
            Checking prior performance and current targets…
          </CardContent>
        </Card>
      ) : preview.isError ? (
        <Card className="border-destructive/40" role="alert">
          <CardContent className="space-y-3 py-6">
            <p>Progression recommendations could not be loaded. Your plan has not changed.</p>
            <Button className="min-h-11" onClick={() => void preview.refetch()} variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (preview.data?.recommendations.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Add measurable set targets to see a progression review.
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-3 xl:grid-cols-2">
          {preview.data?.recommendations.map((recommendation) => {
            const meta = decisionMeta[recommendation.decision];
            const Icon = meta.icon;
            const actionable = recommendation.state === 'current';
            return (
              <Card className="min-w-0 overflow-hidden" key={recommendation.id}>
                <CardHeader className="gap-3 pb-3">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-lg">
                        {recommendation.evidence.exerciseName}
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {recommendation.evidence.policy.family.replaceAll('_', ' ')} · policy v
                        {recommendation.evidence.policy.version}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        <Icon aria-hidden="true" className="mr-1 size-3.5" />
                        {meta.label}
                      </Badge>
                      <Badge variant="secondary">{recommendation.confidence} evidence</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recommendation.state === 'stale' ? (
                    <p
                      className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm"
                      role="alert"
                    >
                      Source performance or the scheduled plan changed. Recompute before making a
                      decision.
                    </p>
                  ) : recommendation.state !== 'current' ? (
                    <p className="rounded-xl border border-border bg-secondary/40 p-3 text-sm">
                      Decision recorded: {recommendation.state}.
                    </p>
                  ) : null}

                  <div
                    className="space-y-2"
                    aria-label={`${recommendation.evidence.exerciseName} target comparison`}
                  >
                    {recommendation.evidence.priorTargets.map((current, index) => {
                      const proposed = recommendation.recommendedTargets[index];
                      return (
                        <div
                          className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-1 rounded-xl bg-secondary/35 p-3 text-sm sm:grid-cols-[auto_1fr_auto_1fr]"
                          key={current.setNumber}
                        >
                          <span className="font-medium">Set {current.setNumber}</span>
                          <span className="min-w-0 break-words text-muted-foreground">
                            Current {targetText(current, weightUnit)}
                          </span>
                          <ArrowRight
                            aria-hidden="true"
                            className="hidden size-4 text-muted sm:block"
                          />
                          <span className="min-w-0 break-words font-medium">
                            Proposed {proposed ? targetText(proposed, weightUnit) : 'Not available'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-xl border border-border/70 p-3">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Why
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {recommendation.facts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Evidence:{' '}
                      {recommendation.evidence.sourceSessionDate
                        ? `completed session ${recommendation.evidence.sourceSessionDate}`
                        : 'no completed matching session'}
                      {' · '}
                      {recommendation.reasonCodes.join(', ')}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <Button
                      className="min-h-11"
                      disabled={!actionable || actionMutation.isPending}
                      onClick={() => void act(recommendation, 'accept')}
                    >
                      Accept targets
                    </Button>
                    <Button
                      className="min-h-11"
                      disabled={!actionable || actionMutation.isPending}
                      onClick={() => setEditing(recommendation)}
                      variant="outline"
                    >
                      Edit
                    </Button>
                    <Button
                      className="min-h-11"
                      disabled={!actionable || actionMutation.isPending}
                      onClick={() => void act(recommendation, 'keep')}
                      variant="outline"
                    >
                      Keep current
                    </Button>
                    <Button
                      className="min-h-11"
                      disabled={!actionable || actionMutation.isPending}
                      onClick={() => setHolding(recommendation)}
                      variant="ghost"
                    >
                      Hold with reason
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {actionMutation.isError ? (
        <p
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
          role="alert"
        >
          {actionMutation.error.message}
        </p>
      ) : null}
      {status ? (
        <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
          {status}
        </p>
      ) : null}

      {editing ? (
        <EditTargetsDialog
          onClose={() => setEditing(null)}
          onSubmit={async (targets) => {
            await act(editing, 'edit', targets);
            setEditing(null);
          }}
          pending={actionMutation.isPending}
          recommendation={editing}
          weightUnit={weightUnit}
        />
      ) : null}
      {holding ? (
        <HoldDialog
          exerciseName={holding.evidence.exerciseName}
          onClose={() => setHolding(null)}
          onSubmit={async (reason) => {
            await act(holding, 'hold', null, reason);
            setHolding(null);
          }}
          pending={actionMutation.isPending}
        />
      ) : null}
    </section>
  );
}

function numberOrNull(value: string) {
  if (value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function EditTargetsDialog({
  onClose,
  onSubmit,
  pending,
  recommendation,
  weightUnit,
}: {
  onClose: () => void;
  onSubmit: (targets: WorkoutProgressionTarget[]) => Promise<void>;
  pending: boolean;
  recommendation: WorkoutProgressionRecommendation;
  weightUnit: string;
}) {
  const [targets, setTargets] = useState(recommendation.recommendedTargets);
  const fields = [
    ['weight', `Weight (${weightUnit})`],
    ['repsMin', 'Reps min'],
    ['repsMax', 'Reps max'],
    ['reps', 'Exact reps'],
    ['seconds', 'Seconds'],
    ['distance', 'Distance'],
  ] as const;

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit proposed targets</DialogTitle>
          <DialogDescription>
            Keep the same sets and make a bounded adjustment. The original recommendation remains in
            the audit history.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-auto pr-1">
          {targets.map((target, targetIndex) => (
            <fieldset className="rounded-xl border border-border p-3" key={target.setNumber}>
              <legend className="px-1 text-sm font-medium">Set {target.setNumber}</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {fields.map(([field, label]) => (
                  <Label className="space-y-1" key={field}>
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <Input
                      disabled={pending}
                      inputMode="decimal"
                      min="0"
                      onChange={(event) => {
                        const next = [...targets];
                        const integerField = ['repsMin', 'repsMax', 'reps', 'seconds'].includes(
                          field,
                        );
                        const parsed = numberOrNull(event.target.value);
                        next[targetIndex] = {
                          ...target,
                          [field]:
                            parsed === null ? null : integerField ? Math.round(parsed) : parsed,
                        };
                        setTargets(next);
                      }}
                      step={field === 'weight' || field === 'distance' ? '0.5' : '1'}
                      type="number"
                      value={target[field] ?? ''}
                    />
                  </Label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <DialogFooter>
          <Button disabled={pending} onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => void onSubmit(targets)}>
            {pending ? 'Applying…' : 'Apply edited targets'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HoldDialog({
  exerciseName,
  onClose,
  onSubmit,
  pending,
}: {
  exerciseName: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  pending: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hold {exerciseName}</DialogTitle>
          <DialogDescription>
            Record why the current prescription should remain in place. No targets will change.
          </DialogDescription>
        </DialogHeader>
        <Label className="space-y-2">
          <span>Hold reason</span>
          <Input
            disabled={pending}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example: repeat once more before increasing"
            value={reason}
          />
        </Label>
        <DialogFooter>
          <Button disabled={pending} onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={pending || reason.trim().length === 0}
            onClick={() => void onSubmit(reason.trim())}
          >
            {pending ? 'Saving…' : 'Record hold'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
