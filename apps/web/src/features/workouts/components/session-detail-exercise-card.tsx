import type { ExerciseTrackingType, SessionSet, WeightUnit, WorkoutSession } from '@pulse/shared';
import { History } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatServing } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { formatSetSummary, getDistanceUnit, getSetDistance } from '../lib/tracking';
import { MarkdownNote } from './markdown-note';
import { SessionExerciseComparison } from './session-comparison';
import {
  WorkoutExerciseCard,
  type WorkoutExerciseCardCompletedExercise,
} from './workout-exercise-card';

export type SessionSetDraft = {
  reps: string;
  weight: string;
};

export type SessionSetDraftKey = keyof SessionSetDraft;

type SessionDetailExerciseCardExercise = {
  cardExercise: WorkoutExerciseCardCompletedExercise;
  exerciseId: string | null;
  notes: string | null;
  archived: boolean;
  sets: SessionSet[];
  supersetGroup: string | null;
  trackingType: ExerciseTrackingType;
};

const integerFormatter = new Intl.NumberFormat('en-US');

export function SessionDetailExerciseCard({
  currentSession,
  exercise,
  isEditing,
  onOpenDetails,
  onUpdateSetDraft,
  previousSession,
  setDrafts,
  showComparison,
  weightUnit,
}: {
  currentSession: WorkoutSession;
  exercise: SessionDetailExerciseCardExercise;
  isEditing: boolean;
  onOpenDetails: (exerciseId: string | null) => void;
  onUpdateSetDraft: (set: SessionSet, key: SessionSetDraftKey, value: string) => void;
  previousSession: WorkoutSession | null;
  setDrafts: Record<string, SessionSetDraft>;
  showComparison: boolean;
  weightUnit: WeightUnit;
}) {
  return (
    <WorkoutExerciseCard
      className={cn(
        isEditing &&
          'border-[color-mix(in_srgb,var(--color-accent-mint)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-accent-mint)_10%,transparent)]',
      )}
      exercise={exercise.cardExercise}
      footerSlot={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {exercise.archived ? <Badge variant="outline">Archived</Badge> : null}
            {exercise.supersetGroup ? (
              <Badge variant="secondary">
                {`Superset ${formatLabel(exercise.supersetGroup.replace(/^superset-?/i, ''))}`}
              </Badge>
            ) : null}
            <p className="text-sm text-muted">
              {`${exercise.sets.length} logged set${exercise.sets.length === 1 ? '' : 's'}`}
            </p>
          </div>

          {isEditing ? (
            <div className="space-y-2.5 rounded-2xl border border-[color-mix(in_srgb,var(--color-accent-mint)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-accent-mint)_10%,transparent)] p-2.5">
              {exercise.sets.map((set) => (
                <SessionSetEditor
                  draft={setDrafts[set.id] ?? createSessionSetDraft(set)}
                  key={set.id}
                  onChange={(key, value) => onUpdateSetDraft(set, key, value)}
                  set={set}
                  trackingType={exercise.trackingType}
                  weightUnit={weightUnit}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {exercise.sets.map((set) => (
                <span
                  className="inline-flex rounded-full border border-border bg-secondary/55 px-2.5 py-1 text-[13px] text-foreground"
                  key={set.id}
                >
                  {formatSetLabel(set, exercise.trackingType, weightUnit)}
                </span>
              ))}
            </div>
          )}

          {showComparison && exercise.exerciseId ? (
            <SessionExerciseComparison
              currentSession={currentSession}
              exerciseId={exercise.exerciseId}
              previousSession={previousSession}
              trackingType={exercise.trackingType}
              weightUnit={weightUnit}
            />
          ) : null}

          {exercise.notes ? (
            <div className="rounded-2xl border border-border bg-secondary/35 px-3 py-2.5 text-sm text-foreground">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Exercise notes
              </p>
              <MarkdownNote className="text-sm text-foreground" content={exercise.notes} />
            </div>
          ) : null}
        </div>
      }
      headerSlot={
        <Button
          aria-label={`Open ${exercise.cardExercise.name} history`}
          className="h-9 self-start px-3 text-xs"
          disabled={!exercise.exerciseId}
          onClick={() => onOpenDetails(exercise.exerciseId)}
          type="button"
          variant="outline"
        >
          <History aria-hidden="true" className="size-3.5" />
          History
        </Button>
      }
      mode="readonly-completed"
      onOpenDetails={exercise.exerciseId ? () => onOpenDetails(exercise.exerciseId) : undefined}
      showLastPerformance={Boolean(exercise.exerciseId)}
      showSetList={!isEditing}
      weightUnit={weightUnit}
    />
  );
}

function SessionSetEditor({
  draft,
  onChange,
  set,
  trackingType,
  weightUnit,
}: {
  draft: SessionSetDraft;
  onChange: (key: SessionSetDraftKey, value: string) => void;
  set: SessionSet;
  trackingType: ExerciseTrackingType;
  weightUnit: WeightUnit;
}) {
  const fields = getSessionSetEditorFields(trackingType, weightUnit);
  const readOnlySummary = getReadOnlyCorrectionSummary(set, trackingType, weightUnit);

  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{`Set ${set.setNumber}`}</p>
          <p className="text-xs text-muted">{formatSetLabel(set, trackingType, weightUnit)}</p>
        </div>
        {set.skipped ? (
          <Badge className="border-border bg-secondary/70" variant="outline">
            Skipped
          </Badge>
        ) : null}
      </div>

      {fields.length > 0 ? (
        <div
          className={cn(
            'mt-2.5 grid gap-2',
            fields.length === 1 ? 'sm:grid-cols-[minmax(0,11rem)]' : 'sm:grid-cols-2',
          )}
        >
          {fields.map((field) => {
            const inputId = `${set.id}-${field.key}`;

            return (
              <div className="space-y-2" key={field.key}>
                <Label
                  className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
                  htmlFor={inputId}
                >
                  {field.label}
                </Label>
                <div className="relative">
                  <Input
                    aria-label={`${field.label} for set ${set.setNumber}`}
                    className={cn('h-10 pr-10', field.suffix ? 'pr-12' : '')}
                    id={inputId}
                    inputMode={field.inputMode}
                    min={0}
                    onChange={(event) => onChange(field.key, event.currentTarget.value)}
                    step={field.step}
                    type="number"
                    value={draft[field.key]}
                  />
                  {field.suffix ? (
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-semibold uppercase text-muted">
                      {field.suffix}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2.5 text-sm text-muted">
          No editable set values are available for this entry.
        </p>
      )}

      {readOnlySummary ? <p className="mt-2.5 text-xs text-muted">{readOnlySummary}</p> : null}
    </div>
  );
}

type SessionSetEditorField = {
  inputMode: 'decimal' | 'numeric';
  key: SessionSetDraftKey;
  label: string;
  step: string;
  suffix?: string;
};

function getSessionSetEditorFields(
  trackingType: ExerciseTrackingType,
  weightUnit: WeightUnit,
): SessionSetEditorField[] {
  const weightField: SessionSetEditorField = {
    inputMode: 'decimal',
    key: 'weight',
    label: 'Weight',
    step: '0.5',
    suffix: weightUnit,
  };

  const repsField: SessionSetEditorField = {
    inputMode: 'numeric',
    key: 'reps',
    label: 'Reps',
    step: '1',
  };

  const secondsField: SessionSetEditorField = {
    inputMode: 'numeric',
    key: 'reps',
    // seconds are stored in the reps column for time-based tracking types
    label: 'Seconds',
    step: '1',
    suffix: 'sec',
  };

  switch (trackingType) {
    case 'weight_reps':
      return [weightField, repsField];
    case 'weight_seconds':
      return [weightField, secondsField];
    case 'bodyweight_reps':
    case 'reps_only':
    case 'reps_seconds':
      return [repsField];
    case 'seconds_only':
    case 'cardio':
      return [secondsField];
    case 'distance':
    default:
      return [];
  }
}

function getReadOnlyCorrectionSummary(
  set: SessionSet,
  trackingType: ExerciseTrackingType,
  weightUnit: WeightUnit,
) {
  const distance = getSetDistance(set);

  if ((trackingType === 'cardio' || trackingType === 'distance') && distance != null) {
    return `Logged distance remains ${formatNumber(distance)} ${getDistanceUnit(weightUnit)}.`;
  }

  if (trackingType === 'reps_seconds') {
    return 'Time corrections are not persisted separately yet, so only reps can be adjusted here.';
  }

  return null;
}

export function createSessionSetDraft(set: SessionSet): SessionSetDraft {
  return {
    reps: set.reps != null ? `${set.reps}` : '',
    weight: set.weight != null ? `${set.weight}` : '',
  };
}

function formatSetLabel(
  set: SessionSet,
  trackingType: ExerciseTrackingType,
  weightUnit: WeightUnit,
) {
  return formatSetSummary(set, trackingType, {
    includeSetNumber: true,
    weightUnit,
  });
}

function formatLabel(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) {
    return integerFormatter.format(value);
  }

  return formatServing(value);
}
