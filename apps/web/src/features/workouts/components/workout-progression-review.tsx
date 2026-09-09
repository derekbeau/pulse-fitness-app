import { useState } from 'react';
import type {
  ExerciseTrackingType,
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

import { formatEffort, isResistanceEffort } from '../lib/effort';
import { EffortValue } from './effort-display';

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

function completedText(
  performance: WorkoutProgressionRecommendation['evidence']['performance'][number] | undefined,
  weightUnit: string,
  trackingType: ExerciseTrackingType,
) {
  if (!performance) return 'Not recorded';
  const parts: string[] = [];
  if (performance.weight !== null) parts.push(`${performance.weight} ${weightUnit}`);
  if (performance.reps !== null) parts.push(`${performance.reps} reps`);
  if (performance.seconds !== null) parts.push(`${performance.seconds} sec`);
  if (performance.distance !== null) parts.push(`${performance.distance} distance`);
  if (performance.zone !== null) parts.push(`Zone ${performance.zone}`);
  const effort = formatEffort(performance, trackingType);
  if (!isResistanceEffort(trackingType) && effort.displayText) parts.push(effort.displayText);
  if (performance.skipped) parts.push('Skipped');
  else if (!performance.completed) parts.push('Not completed');
  return (
    <>
      {parts.join(' · ') || 'No measured completion'}
      {isResistanceEffort(trackingType) ? (
        <EffortValue effort={effort} label={`Completed set ${performance.setNumber}`} />
      ) : null}
    </>
  );
}

function availabilityMessage(recommendation: WorkoutProgressionRecommendation) {
  if (
    recommendation.evidence.managementMode === 'directly_coached' ||
    recommendation.evidence.managementMode === 'non_progressing'
  ) {
    return null;
  }
  if (recommendation.reasonCodes.includes('MISSING_POLICY')) {
    return 'No progression policy is configured for this exercise. The current plan has not changed.';
  }
  if (recommendation.reasonCodes.includes('NO_COMPLETED_HISTORY')) {
    return 'No completed matching history is available yet. The current plan has not changed.';
  }
  if (recommendation.confidence === 'unavailable') {
    return 'This recommendation is unavailable because its evidence could not support a safe change. The current plan has not changed.';
  }
  return null;
}

function diagnosticMessage(
  diagnostic: NonNullable<WorkoutProgressionRecommendation['evidence']['diagnostics']>[number],
) {
  const source =
    diagnostic.source === 'current_scheduled_target'
      ? 'current scheduled target'
      : 'historical prescribed target';
  const raw = Object.entries(diagnostic.raw)
    .map(([key, value]) => `${key}=${value === null ? 'null' : String(value)}`)
    .join(', ');
  if (diagnostic.reason === 'REDUNDANT_EXACT_REPS') {
    return `Legacy exact-reps bounds were normalized for evaluation in the ${source} (set ${diagnostic.setNumber ?? 'unknown'}).`;
  }
  return `Invalid ${source} at set ${diagnostic.setNumber ?? 'unknown'}: ${diagnostic.reason}. Raw values: ${raw}.`;
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
            Targets change only through an explicit self-review action or authorized agent
            publication.
          </p>
        </div>
        {!preview.isError ? (
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
        ) : null}
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
            <Button
              className="min-h-11"
              disabled={preview.isFetching}
              onClick={() => void preview.refetch({ cancelRefetch: false })}
              variant="outline"
            >
              {preview.isFetching ? 'Retrying…' : 'Retry'}
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
        <div className="grid min-w-0 gap-3">
          {preview.data?.recommendations.map((recommendation) => {
            const meta = decisionMeta[recommendation.decision];
            const Icon = meta.icon;
            const actionable = recommendation.state === 'current';
            const canApplyTargets = actionable && recommendation.confidence !== 'unavailable';
            const selfManaged = recommendation.evidence.managementMode === 'self_managed';
            const finalReview = recommendation.finalReview ?? null;
            const comparisonSetNumbers = [
              ...new Set([
                ...recommendation.evidence.priorTargets.map((target) => target.setNumber),
                ...recommendation.evidence.performance.map((set) => set.setNumber),
                ...(recommendation.evidence.diagnostics ?? []).flatMap((item) =>
                  item.setNumber !== null ? [item.setNumber] : [],
                ),
              ]),
            ].sort((left, right) => left - right);
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
                      <Badge variant="outline">
                        {recommendation.evidence.managementMode.replaceAll('_', ' ')}
                      </Badge>
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

                  {!selfManaged && recommendation.state === 'current' ? (
                    <p
                      className="rounded-xl border border-border bg-secondary/40 p-3 text-sm"
                      role="status"
                    >
                      This exercise is managed by your authorized coaching agent. You can start or
                      adjust the workout without a separate approval here.
                    </p>
                  ) : null}

                  {finalReview ? (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                      <p className="font-medium">What changed and why</p>
                      <p className="mt-1">{finalReview.summary}</p>
                      <p className="mt-1 text-muted-foreground">{finalReview.reason}</p>
                      <p className="mt-2 break-all text-xs text-muted-foreground">
                        {finalReview.disposition.replaceAll('_', ' ')} · {finalReview.actorLabel} ·
                        final prescription {finalReview.finalPrescriptionFingerprint}
                      </p>
                    </div>
                  ) : null}

                  {availabilityMessage(recommendation) ? (
                    <p
                      className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm"
                      role="status"
                    >
                      {availabilityMessage(recommendation)}
                    </p>
                  ) : null}

                  {recommendation.evidence.diagnostics?.length ? (
                    <div
                      aria-label={`${recommendation.evidence.exerciseName} evidence diagnostics`}
                      className="rounded-xl border border-border/70 bg-secondary/30 p-3 text-sm"
                    >
                      <p className="font-medium">Evidence compatibility</p>
                      <ul className="mt-2 list-disc space-y-1 break-words pl-5 text-muted-foreground">
                        {recommendation.evidence.diagnostics.map((diagnostic, index) => (
                          <li
                            key={`${diagnostic.reason}-${diagnostic.source}-${diagnostic.setId}-${index}`}
                          >
                            {diagnosticMessage(diagnostic)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div
                    className="overflow-x-auto rounded-xl border border-border/70"
                    role="region"
                    aria-label={`${recommendation.evidence.exerciseName} comparison scroll area`}
                    tabIndex={0}
                  >
                    <table
                      aria-label={`${recommendation.evidence.exerciseName} exact progression comparison`}
                      className="w-full min-w-[42rem] text-left text-sm"
                    >
                      <thead className="bg-secondary/55 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2" scope="col">
                            Set
                          </th>
                          <th className="px-3 py-2" scope="col">
                            Previous prescription
                          </th>
                          <th className="px-3 py-2" scope="col">
                            Completed performance
                          </th>
                          <th className="px-3 py-2" scope="col">
                            Current plan
                          </th>
                          <th className="px-3 py-2" scope="col">
                            Proposed target
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonSetNumbers.map((setNumber) => {
                          const current = recommendation.evidence.priorTargets.find(
                            (target) => target.setNumber === setNumber,
                          );
                          const performance = recommendation.evidence.performance.find(
                            (set) => set.setNumber === setNumber,
                          );
                          const currentDiagnostic = recommendation.evidence.diagnostics?.find(
                            (item) =>
                              item.source === 'current_scheduled_target' &&
                              item.setNumber === setNumber &&
                              item.reason !== 'REDUNDANT_EXACT_REPS',
                          );
                          const historicalDiagnostic = recommendation.evidence.diagnostics?.find(
                            (item) =>
                              item.source === 'historical_prescribed_target' &&
                              item.setNumber === setNumber &&
                              item.reason !== 'REDUNDANT_EXACT_REPS',
                          );
                          const proposed = current
                            ? (finalReview?.finalTargets ?? recommendation.recommendedTargets).find(
                                (target) => target.setId === current.setId,
                              )
                            : undefined;
                          return (
                            <tr
                              className="border-t border-border/60 align-top"
                              key={current?.setId ?? performance?.setId ?? setNumber}
                            >
                              <th className="whitespace-nowrap px-3 py-3" scope="row">
                                Set {setNumber}
                              </th>
                              <td className="px-3 py-3 text-muted-foreground">
                                {performance
                                  ? targetText(performance.prescribed, weightUnit)
                                  : historicalDiagnostic
                                    ? diagnosticMessage(historicalDiagnostic)
                                    : 'No matching source set'}
                                {performance ? (
                                  <span className="mt-1 block break-all text-xs">
                                    Source session set: {performance.setId}; scheduled source:{' '}
                                    {performance.sourceScheduledSetId ?? 'unavailable'}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-3 text-muted-foreground">
                                {performance
                                  ? completedText(
                                      performance,
                                      weightUnit,
                                      recommendation.evidence.trackingType,
                                    )
                                  : historicalDiagnostic?.observed
                                    ? Object.entries(historicalDiagnostic.observed)
                                        .map(([key, value]) => `${key}=${value ?? 'null'}`)
                                        .join(' · ')
                                    : 'Not recorded'}
                              </td>
                              <td className="px-3 py-3">
                                {current
                                  ? targetText(current, weightUnit)
                                  : currentDiagnostic
                                    ? diagnosticMessage(currentDiagnostic)
                                    : 'No current set'}
                                {current ? (
                                  <span className="mt-1 block break-all text-xs">
                                    Current scheduled set: {current.setId}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-3 font-medium">
                                {proposed ? targetText(proposed, weightUnit) : 'Not available'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      Policy source:{' '}
                      {recommendation.evidence.policySource.type === 'programming_config'
                        ? `${recommendation.evidence.policySource.actorLabel} · revision ${recommendation.evidence.policySource.revision} · ${recommendation.evidence.priority === null ? 'historical priority unavailable' : recommendation.evidence.priority ? 'priority exercise' : 'standard priority'}`
                        : 'No explicit programming policy'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Review mode: {recommendation.evidence.managementMode.replaceAll('_', ' ')}
                      {recommendation.evidence.managementReason
                        ? ` · ${recommendation.evidence.managementReason}`
                        : ''}
                      {recommendation.evidence.ownerAuthorization
                        ? ` · owner authorized at ${new Date(recommendation.evidence.ownerAuthorization.authorizedAt).toLocaleString()}`
                        : ''}
                    </p>
                  </div>

                  {selfManaged ? (
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <Button
                        className="min-h-11"
                        disabled={!canApplyTargets || actionMutation.isPending}
                        onClick={() => void act(recommendation, 'accept')}
                      >
                        Accept targets
                      </Button>
                      <Button
                        className="min-h-11"
                        disabled={!canApplyTargets || actionMutation.isPending}
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
                  ) : null}
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
    ['zone', 'Zone'],
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
                      min="1"
                      onChange={(event) => {
                        const next = [...targets];
                        const integerField = [
                          'repsMin',
                          'repsMax',
                          'reps',
                          'seconds',
                          'zone',
                        ].includes(field);
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
