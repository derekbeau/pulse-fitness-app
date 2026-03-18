import { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Dumbbell, ListChecks, Save, X } from 'lucide-react';
import { formatWeight, type WeightUnit } from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { useSaveAsTemplate } from '@/hooks/use-save-as-template';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatServing } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import {
  appendTemplateTags,
  normalizeTemplateTags,
  TEMPLATE_TAG_LIMIT,
  TEMPLATE_TAG_SUGGESTIONS,
} from '../lib/template-tags';
import { getDistanceUnit, type TrackingSummaryMetricLabel } from '../lib/tracking';
import type { ActiveWorkoutFeedbackDraft } from '../types';
import { MarkdownNote } from './markdown-note';

type SessionSummaryProps = {
  className?: string;
  defaultDescription?: string;
  defaultTags?: string[];
  duration: string;
  exerciseResults?: SessionSummaryExerciseResult[];
  exercisesCompleted: number;
  feedback?: ActiveWorkoutFeedbackDraft;
  onDone: () => void;
  onNotesChange?: (notes: string) => void;
  sessionNotes?: string;
  sessionId?: string | null;
  summaryMetricLabel?: TrackingSummaryMetricLabel | 'mixed';
  summaryMetricMixedValue?: string | null;
  summaryMetricValue?: number | null;
  completedSets?: number;
  summarySaving?: boolean;
  totalVolume?: number;
  totalReps: number;
  totalSets: number;
  weightUnit?: WeightUnit;
  workoutName: string;
};

export type SessionSummaryExerciseResult = {
  id: string;
  metricLabel?: TrackingSummaryMetricLabel;
  metricValue?: number;
  name: string;
  notes?: string | null;
  reps: number;
  setsCompleted: number;
  totalSets: number;
  volume?: number;
};

export function SessionSummary({
  className,
  defaultDescription = '',
  defaultTags = [],
  duration,
  exerciseResults = [],
  exercisesCompleted,
  feedback = [],
  onDone,
  onNotesChange,
  sessionNotes: initialSessionNotes = '',
  sessionId = null,
  summaryMetricLabel = 'volume',
  summaryMetricMixedValue = null,
  summaryMetricValue = null,
  completedSets,
  summarySaving = false,
  totalVolume = 0,
  totalReps,
  totalSets,
  weightUnit = 'lbs',
  workoutName,
}: SessionSummaryProps) {
  const saveAsTemplateMutation = useSaveAsTemplate(sessionId);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState(workoutName);
  const [templateDescription, setTemplateDescription] = useState(defaultDescription);
  const [templateTags, setTemplateTags] = useState(() => normalizeTemplateTags(defaultTags));
  const [templateTagInput, setTemplateTagInput] = useState('');
  const [isTagInputFocused, setIsTagInputFocused] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const hasMaxTemplateTags = templateTags.length >= TEMPLATE_TAG_LIMIT;
  const resolvedSummaryMetricValue = getSummaryMetricValue({
    metricLabel: summaryMetricLabel,
    metricMixedValue: summaryMetricMixedValue,
    metricValue: summaryMetricValue,
    totalVolume,
    totalReps,
    weightUnit,
  });
  const shouldShowRepsPill = totalReps > 0 && summaryMetricLabel !== 'reps';
  const normalizedTagQuery = templateTagInput.trim().toLowerCase();
  const suggestedTemplateTags = useMemo(
    () =>
      TEMPLATE_TAG_SUGGESTIONS.filter((tag) => {
        if (templateTags.includes(tag)) {
          return false;
        }

        if (!normalizedTagQuery) {
          return true;
        }

        return tag.includes(normalizedTagQuery);
      }),
    [normalizedTagQuery, templateTags],
  );

  function commitTemplateTagInput() {
    if (!templateTagInput.trim() || hasMaxTemplateTags) {
      setTemplateTagInput('');
      return;
    }

    setTemplateTags((current) => appendTemplateTags(current, templateTagInput));
    setTemplateTagInput('');
  }

  function removeTemplateTag(tag: string) {
    setTemplateTags((current) => current.filter((currentTag) => currentTag !== tag));
  }

  function addSuggestedTemplateTag(tag: string) {
    if (hasMaxTemplateTags) {
      return;
    }

    setTemplateTags((current) => appendTemplateTags(current, tag));
    setTemplateTagInput('');
  }

  return (
    <>
      <Card className={cn(`overflow-hidden py-0 shadow-lg ${accentCardStyles.mint}`, className)}>
        <CardContent className="space-y-4 px-4 py-5 sm:px-5 sm:py-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/40 px-3 py-1 text-xs font-semibold tracking-[0.18em] uppercase dark:border-border dark:bg-secondary/60">
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
              Session complete
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Workout summary</h1>
              <p className="max-w-2xl text-sm opacity-75 dark:text-muted dark:opacity-100">
                Logged, reflected, and ready to head back to the workouts overview.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <SummaryPill
              icon={Dumbbell}
              label={getSummaryMetricLabel(summaryMetricLabel)}
              tone={getMetricTone(summaryMetricLabel)}
              value={resolvedSummaryMetricValue}
            />
            <SummaryPill icon={Clock3} label="Duration" tone="time" value={duration} />
            <SummaryPill
              icon={ListChecks}
              label="Sets"
              tone="count"
              value={completedSets === undefined ? `${totalSets}` : `${completedSets}/${totalSets}`}
            />
            {shouldShowRepsPill ? (
              <SummaryPill icon={CheckCircle2} label="Reps" tone="count" value={`${totalReps}`} />
            ) : null}
          </div>

          {exerciseResults.length > 0 ? (
            <section className="space-y-2 rounded-3xl border border-black/10 bg-white/35 p-3 dark:border-border dark:bg-secondary/50">
              <h2 className="text-sm font-semibold tracking-[0.18em] uppercase opacity-70 dark:text-muted dark:opacity-100">
                Exercise results
              </h2>
              <div className="space-y-2">
                {exerciseResults.map((exercise) => (
                  <article
                    className="rounded-2xl border border-black/10 bg-white/45 p-3 dark:border-border dark:bg-card"
                    key={exercise.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{exercise.name}</p>
                      <span className="shrink-0 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[11px] font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                        {`${exercise.setsCompleted}/${exercise.totalSets} sets`}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <MetricChip
                        label={getExerciseMetricLabel(exercise.metricLabel ?? 'volume')}
                        tone={getMetricTone(exercise.metricLabel ?? 'volume')}
                        value={formatSummaryMetricValue(
                          exercise.metricValue ?? exercise.volume ?? 0,
                          exercise.metricLabel ?? 'volume',
                          weightUnit,
                        )}
                      />
                      {exercise.reps > 0 && (exercise.metricLabel ?? 'volume') !== 'reps' ? (
                        <MetricChip label="Reps" tone="count" value={`${exercise.reps}`} />
                      ) : null}
                    </div>
                    {exercise.notes?.trim() ? (
                      <MarkdownNote
                        className="mt-2 text-xs text-muted"
                        content={exercise.notes.trim()}
                      />
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted">
            <span>{`${exercisesCompleted} exercise${exercisesCompleted === 1 ? '' : 's'} logged`}</span>
          </div>

          <section className="space-y-2 rounded-3xl border border-black/10 bg-white/35 p-4 dark:border-border dark:bg-secondary/50">
            <h2 className="text-sm font-semibold tracking-[0.18em] uppercase opacity-70 dark:text-muted dark:opacity-100">
              Session notes
            </h2>
            <p className="text-sm text-muted">
              What happened today? Anything notable about this session?
            </p>
            <Textarea
              aria-label="Session notes"
              data-testid="session-summary-notes"
              id="session-summary-notes"
              name="session-summary-notes"
              className="rounded-2xl border-black/10 bg-card dark:border-border"
              onChange={(event) => {
                onNotesChange?.(event.target.value);
              }}
              placeholder="What happened today? Anything notable about this session?"
              rows={4}
              value={initialSessionNotes}
            />
          </section>

          {feedback.length > 0 ? (
            <section className="space-y-2 rounded-3xl border border-black/10 bg-white/35 p-3.5 dark:border-border dark:bg-secondary/50">
              <div className="space-y-0.5">
                <h2 className="text-lg font-semibold text-foreground">Session feedback</h2>
                <p className="text-sm opacity-75 dark:text-muted dark:opacity-100">
                  Saved check-ins from the end of this workout.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {feedback.map((field) => (
                  <div
                    className="rounded-2xl border border-black/10 bg-white/45 p-3 dark:border-border dark:bg-card"
                    key={field.id}
                  >
                    <p className="text-xs font-semibold tracking-[0.18em] uppercase opacity-65 dark:text-muted dark:opacity-100">
                      {field.label}
                    </p>
                    <p className="mt-1.5 text-lg leading-none font-semibold text-foreground">
                      {formatFeedbackFieldValue(field)}
                    </p>
                    {field.notes?.trim() ? (
                      <MarkdownNote
                        className="mt-1.5 text-xs text-muted"
                        content={field.notes.trim()}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              className="w-full border-black/10 bg-white/60 hover:bg-white/75 sm:w-auto dark:bg-secondary dark:text-foreground dark:hover:bg-secondary/80"
              onClick={() => {
                setTemplateName(workoutName);
                setTemplateDescription(defaultDescription);
                setTemplateTags(normalizeTemplateTags(defaultTags));
                setTemplateTagInput('');
                setIsTagInputFocused(false);
                setSaveMessage(null);
                setIsSaveDialogOpen(true);
              }}
              type="button"
              variant="secondary"
            >
              <Save aria-hidden="true" className="size-4" />
              Save as Template
            </Button>

            <Button
              className="w-full border-black/10 bg-white/60 hover:bg-white/75 sm:w-auto dark:bg-secondary dark:text-foreground dark:hover:bg-secondary/80"
              disabled={summarySaving}
              onClick={onDone}
              type="button"
              variant="secondary"
            >
              {summarySaving ? 'Saving...' : 'Done'}
            </Button>
          </div>

          {saveMessage ? (
            <p
              aria-live="polite"
              className="rounded-xl border border-black/15 bg-white/45 px-3 py-2 text-sm font-medium opacity-80 dark:border-border dark:bg-secondary/60 dark:text-muted dark:opacity-100"
            >
              {saveMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog onOpenChange={setIsSaveDialogOpen} open={isSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this workout as a template</DialogTitle>
            <DialogDescription>
              Capture this completed session as a reusable starting point for future workouts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="template-name">
                Name
              </label>
              <Input
                id="template-name"
                onChange={(event) => setTemplateName(event.target.value)}
                value={templateName}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="template-description">
                Description
              </label>
              <Textarea
                id="template-description"
                onChange={(event) => setTemplateDescription(event.target.value)}
                placeholder="Add a quick note about the goal or focus of this session."
                value={templateDescription}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="template-tags">
                Tags
              </label>
              <div className="flex flex-wrap gap-2">
                {templateTags.map((tag) => (
                  <Badge className="gap-1.5" key={tag} variant="secondary">
                    <span>{tag}</span>
                    <button
                      aria-label={`Remove tag ${tag}`}
                      className="rounded-full p-0.5 transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => removeTemplateTag(tag)}
                      type="button"
                    >
                      <X aria-hidden="true" className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Input
                id="template-tags"
                onBlur={() => {
                  setIsTagInputFocused(false);
                  commitTemplateTagInput();
                }}
                onChange={(event) => setTemplateTagInput(event.target.value)}
                onFocus={() => setIsTagInputFocused(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    commitTemplateTagInput();
                  }

                  if (
                    event.key === 'Backspace' &&
                    templateTagInput.length === 0 &&
                    templateTags.length > 0
                  ) {
                    event.preventDefault();
                    setTemplateTags((current) => current.slice(0, current.length - 1));
                  }
                }}
                placeholder="Add a tag"
                value={templateTagInput}
              />
              {isTagInputFocused && suggestedTemplateTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {suggestedTemplateTags.map((tag) => (
                    <Button
                      className="h-7 rounded-full px-3 text-xs"
                      key={tag}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => addSuggestedTemplateTag(tag)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {tag}
                    </Button>
                  ))}
                </div>
              ) : null}
              {hasMaxTemplateTags ? (
                <p className="text-xs text-muted">Tag limit reached ({TEMPLATE_TAG_LIMIT}).</p>
              ) : (
                <p className="text-xs text-muted">
                  Press Enter or comma to add tags. Tags are stored in lowercase.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={templateName.trim().length === 0 || saveAsTemplateMutation.isPending}
              onClick={() => {
                const payload = {
                  name: templateName.trim(),
                  description: templateDescription.trim(),
                  tags: templateTags,
                };

                if (sessionId) {
                  saveAsTemplateMutation.mutate(payload, {
                    onError: () => {
                      setSaveMessage('Unable to save this session as a template. Try again.');
                    },
                    onSuccess: (template) => {
                      setSaveMessage(`Saved "${template.name}" as a template.`);
                      setIsSaveDialogOpen(false);
                    },
                  });
                  return;
                }

                setSaveMessage(`Saved "${payload.name}" to mock templates.`);
                setIsSaveDialogOpen(false);
              }}
              type="button"
            >
              {saveAsTemplateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatFeedbackFieldValue(field: ActiveWorkoutFeedbackDraft[number]) {
  switch (field.type) {
    case 'scale':
      return `${field.value ?? '-'} / ${field.max}`;
    case 'text':
      return field.value?.trim() ? field.value : '-';
    case 'yes_no':
      if (field.value === null || field.value === undefined) {
        return '-';
      }

      return field.value ? 'Yes' : 'No';
    case 'emoji':
      return field.value?.trim() ? field.value : '-';
    case 'slider':
      return field.value === null || field.value === undefined
        ? '-'
        : `${field.value} (${field.min} - ${field.max})`;
    case 'multi_select':
      return (field.value ?? []).length > 0 ? (field.value ?? []).join(', ') : '-';
    default:
      return '-';
  }
}

function getSummaryMetricLabel(label: TrackingSummaryMetricLabel | 'mixed') {
  switch (label) {
    case 'reps':
      return 'Total reps';
    case 'seconds':
      return 'Total time';
    case 'distance':
      return 'Total distance';
    case 'mixed':
      return 'Tracked metrics';
    case 'volume':
    default:
      return 'Total volume';
  }
}

function getExerciseMetricLabel(label: TrackingSummaryMetricLabel) {
  switch (label) {
    case 'reps':
      return 'Reps';
    case 'seconds':
      return 'Seconds';
    case 'distance':
      return 'Distance';
    case 'volume':
    default:
      return 'Volume';
  }
}

function formatSummaryMetricValue(
  value: number,
  label: TrackingSummaryMetricLabel,
  weightUnit: WeightUnit,
) {
  if (label === 'volume') {
    return formatWeight(value, weightUnit);
  }

  if (label === 'reps') {
    return `${Math.round(value)}`;
  }

  if (label === 'seconds') {
    return `${formatServing(value)} sec`;
  }

  return `${formatServing(value)} ${getDistanceUnit(weightUnit)}`;
}

function getSummaryMetricValue({
  metricLabel,
  metricMixedValue,
  metricValue,
  totalReps,
  totalVolume,
  weightUnit,
}: {
  metricLabel: TrackingSummaryMetricLabel | 'mixed';
  metricMixedValue: string | null;
  metricValue: number | null;
  totalReps: number;
  totalVolume: number;
  weightUnit: WeightUnit;
}) {
  if (metricLabel === 'mixed') {
    return metricMixedValue ?? '-';
  }

  if (metricValue != null) {
    return formatSummaryMetricValue(metricValue, metricLabel, weightUnit);
  }

  if (metricLabel === 'reps') {
    return `${totalReps}`;
  }

  return formatSummaryMetricValue(totalVolume, metricLabel, weightUnit);
}

function getMetricTone(label: TrackingSummaryMetricLabel | 'mixed'): 'count' | 'time' | 'volume' {
  if (label === 'seconds') {
    return 'time';
  }

  if (label === 'volume') {
    return 'volume';
  }

  return 'count';
}

function SummaryPill({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  tone: 'count' | 'time' | 'volume';
  value: string;
}) {
  const toneClass =
    tone === 'volume'
      ? 'border-blue-500/25 bg-blue-500/12 text-blue-900 dark:text-blue-100'
      : tone === 'time'
        ? 'border-emerald-500/25 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100'
        : 'border-fuchsia-500/25 bg-fuchsia-500/12 text-fuchsia-900 dark:text-fuchsia-100';
  const testIdLabel = label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div
      data-testid={`summary-pill-${tone}-${testIdLabel}`}
      className={cn(
        'inline-flex min-w-[120px] items-center gap-2 rounded-full border px-3 py-1.5',
        toneClass,
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase opacity-85">
        <Icon aria-hidden="true" className="size-3" />
        <span>{label}</span>
      </div>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function MetricChip({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'count' | 'time' | 'volume';
  value: string;
}) {
  const toneClass =
    tone === 'volume'
      ? 'bg-blue-500/12 text-blue-800 dark:text-blue-200'
      : tone === 'time'
        ? 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-200'
        : 'bg-fuchsia-500/12 text-fuchsia-800 dark:text-fuchsia-200';

  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', toneClass)}>
      {`${label}: ${value}`}
    </span>
  );
}
