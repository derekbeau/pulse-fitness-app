import { useState, type Dispatch, type SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import type { ActiveWorkoutCustomFeedbackField, ActiveWorkoutFeedbackDraft } from '../types';

export const STANDARD_FEEDBACK_QUESTIONS: ActiveWorkoutCustomFeedbackField[] = [
  {
    id: 'session-rpe',
    label: 'Session RPE',
    max: 10,
    min: 1,
    optional: false,
    type: 'scale',
    value: null,
  },
  {
    id: 'energy-post-workout',
    label: 'Energy post workout',
    optional: false,
    options: ['😫', '😕', '😐', '🙂', '💪'],
    type: 'emoji',
    value: null,
  },
  {
    id: 'pain-discomfort',
    label: 'Any pain or discomfort?',
    optional: false,
    type: 'yes_no',
    value: null,
  },
];

type SessionFeedbackProps = {
  className?: string;
  fields: ActiveWorkoutCustomFeedbackField[];
  onSubmit: (feedback: ActiveWorkoutFeedbackDraft) => void;
};

export function SessionFeedback({ className, fields, onSubmit }: SessionFeedbackProps) {
  const [feedback, setFeedback] = useState<ActiveWorkoutFeedbackDraft>(() =>
    mergeFeedbackFields(fields).map(normalizeFeedbackField),
  );

  const isComplete = feedback.every((field) => {
    if (field.optional) {
      return true;
    }

    if (field.id === 'pain-discomfort' && field.type === 'yes_no' && field.value === true) {
      return (field.notes ?? '').trim().length > 0;
    }

    switch (field.type) {
      case 'scale':
      case 'slider':
        return field.value !== null && field.value !== undefined;
      case 'text':
        return (field.value ?? '').trim().length > 0;
      case 'yes_no':
        return field.value !== null && field.value !== undefined;
      case 'emoji':
        return (field.value ?? '').trim().length > 0;
      case 'multi_select':
        return (field.value ?? []).length > 0;
      default:
        return false;
    }
  });

  return (
    <Card className={cn('overflow-hidden py-0 shadow-sm', className)}>
      <CardHeader className="gap-3 border-b border-border bg-[var(--color-accent-pink)] py-6 text-on-pink dark:border-b-border dark:bg-card dark:text-foreground">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-[0.22em] uppercase opacity-70 dark:text-muted dark:opacity-100">
            Post-workout feedback
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">How did this session feel?</h2>
          <p className="max-w-2xl text-sm opacity-75 dark:text-muted dark:opacity-100">
            Capture the session check-ins before you wrap the workout.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-5 py-5 sm:px-6">
        {feedback.map((field) => (
          <section className="rounded-3xl border border-border bg-secondary/25 p-4" key={field.id}>
            <div className="space-y-3">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">{field.label}</h3>
                <p className="text-sm text-muted">{getFeedbackDescription(field)}</p>
              </div>

              {renderFeedbackInput(field, setFeedback)}

              {field.id === 'pain-discomfort' && field.type === 'yes_no' && field.value === true ? (
                <div className="space-y-2">
                  <label
                    className="text-xs font-semibold tracking-[0.18em] text-muted uppercase"
                    htmlFor="pain-discomfort-details"
                  >
                    Pain/discomfort details
                  </label>
                  <Textarea
                    id="pain-discomfort-details"
                    onChange={(event) =>
                      setFeedback((current) =>
                        current.map((entry) =>
                          entry.id === field.id && entry.type === 'yes_no'
                            ? {
                                ...entry,
                                notes: event.target.value,
                              }
                            : entry,
                        ),
                      )
                    }
                    placeholder="Describe where it happened and what movements triggered it."
                    value={field.notes ?? ''}
                  />
                </div>
              ) : null}

              {!(field.id === 'pain-discomfort' && field.type === 'yes_no' && field.value === true) ? (
                <div className="space-y-2">
                  <label
                    className="text-xs font-semibold tracking-[0.18em] text-muted uppercase"
                    htmlFor={`${field.id}-notes`}
                  >
                    Optional notes
                  </label>
                  <Textarea
                    id={`${field.id}-notes`}
                    onChange={(event) =>
                      setFeedback((current) =>
                        current.map((entry) =>
                          entry.id === field.id
                            ? {
                                ...entry,
                                notes: event.target.value,
                              }
                            : entry,
                        ),
                      )
                    }
                    placeholder={`Add context about ${field.label.toLowerCase()} if it mattered today.`}
                    value={field.notes ?? ''}
                  />
                </div>
              ) : null}
            </div>
          </section>
        ))}

        <Button
          className="w-full sm:w-auto"
          disabled={!isComplete}
          onClick={() => onSubmit(feedback)}
          type="button"
        >
          Finalize session
        </Button>
      </CardContent>
    </Card>
  );
}

function mergeFeedbackFields(fields: ActiveWorkoutCustomFeedbackField[]) {
  const standardIds = new Set(STANDARD_FEEDBACK_QUESTIONS.map((field) => field.id));
  const templateFields = fields.filter((field) => {
    if (standardIds.has(field.id)) {
      return false;
    }

    const canonicalId = getCanonicalStandardFieldId(field);

    return canonicalId === null;
  });

  return [...STANDARD_FEEDBACK_QUESTIONS, ...templateFields];
}

function getCanonicalStandardFieldId(field: ActiveWorkoutCustomFeedbackField) {
  const normalizedId = field.id.trim().toLowerCase();
  const normalizedLabel = field.label.trim().toLowerCase().replace(/\s+/g, ' ');

  const sessionRpeIds = new Set(['session-rpe', 'rpe', 'session_rpe']);
  const energyIds = new Set([
    'energy-post-workout',
    'energy-level',
    'energy-post',
    'energy_post_workout',
    'energy_level',
  ]);
  const painIds = new Set(['pain-discomfort', 'pain_discomfort', 'knee-pain', 'knee_pain']);

  const sessionRpeLabels = new Set(['session rpe', 'rpe']);
  const energyLabels = new Set(['energy post workout', 'energy level']);
  const painLabels = new Set(['any pain or discomfort?', 'pain/discomfort', 'knee pain']);

  if (sessionRpeIds.has(normalizedId) || sessionRpeLabels.has(normalizedLabel)) {
    return 'session-rpe';
  }

  if (energyIds.has(normalizedId) || energyLabels.has(normalizedLabel)) {
    return 'energy-post-workout';
  }

  if (painIds.has(normalizedId) || painLabels.has(normalizedLabel)) {
    return 'pain-discomfort';
  }

  return null;
}

function normalizeFeedbackField(field: ActiveWorkoutCustomFeedbackField): ActiveWorkoutCustomFeedbackField {
  switch (field.type) {
    case 'scale':
      return {
        ...field,
        notes: field.notes ?? '',
        value: field.value ?? null,
      };
    case 'text':
      return {
        ...field,
        notes: field.notes ?? '',
        value: field.value ?? '',
      };
    case 'yes_no':
      return {
        ...field,
        notes: field.notes ?? '',
        value: field.value ?? null,
      };
    case 'emoji':
      return {
        ...field,
        notes: field.notes ?? '',
        value: field.value ?? null,
      };
    case 'slider':
      return {
        ...field,
        notes: field.notes ?? '',
        step: field.step ?? 1,
        value: field.value ?? field.min,
      };
    case 'multi_select':
      return {
        ...field,
        notes: field.notes ?? '',
        value: field.value ?? [],
      };
    default:
      return field;
  }
}

function getFeedbackDescription(field: ActiveWorkoutCustomFeedbackField) {
  switch (field.type) {
    case 'scale':
      return `Rate ${field.label.toLowerCase()} from ${field.min} to ${field.max}.`;
    case 'text':
      return `Add a note for ${field.label.toLowerCase()}.`;
    case 'yes_no':
      return 'Select yes or no.';
    case 'emoji':
      return 'Choose the option that best matches how you felt.';
    case 'slider':
      return `Slide from ${field.min} to ${field.max}.`;
    case 'multi_select':
      return 'Select all that apply.';
    default:
      return '';
  }
}

function renderFeedbackInput(
  field: ActiveWorkoutCustomFeedbackField,
  setFeedback: Dispatch<SetStateAction<ActiveWorkoutFeedbackDraft>>,
) {
  switch (field.type) {
    case 'scale':
      return (
        <div aria-label={`${field.label} rating`} className="flex flex-wrap gap-2" role="group">
          {Array.from({ length: field.max - field.min + 1 }, (_, index) => field.min + index).map(
            (score) => {
              const isSelected = field.value === score;

              return (
                <Button
                  aria-pressed={isSelected}
                  className={cn(
                    'min-w-11',
                    isSelected &&
                      'border-transparent bg-[var(--color-accent-cream)] text-on-cream hover:bg-[var(--color-accent-cream)]/90 dark:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/30',
                  )}
                  key={score}
                  onClick={() =>
                    setFeedback((current) =>
                      current.map((entry) =>
                        entry.id === field.id && entry.type === 'scale'
                          ? { ...entry, value: score }
                          : entry,
                      ),
                    )
                  }
                  size="sm"
                  type="button"
                  variant={isSelected ? 'secondary' : 'outline'}
                >
                  {score}
                </Button>
              );
            },
          )}
        </div>
      );
    case 'text':
      return (
        <Textarea
          id={`${field.id}-value`}
          onChange={(event) =>
            setFeedback((current) =>
              current.map((entry) =>
                entry.id === field.id && entry.type === 'text'
                  ? { ...entry, value: event.target.value }
                  : entry,
              ),
            )
          }
          placeholder={`Add your ${field.label.toLowerCase()} notes.`}
          value={field.value}
        />
      );
    case 'yes_no':
      return (
        <div aria-label={`${field.label} response`} className="flex gap-2" role="group">
          <Button
            aria-pressed={field.value === true}
            onClick={() =>
              setFeedback((current) =>
                current.map((entry) =>
                  entry.id === field.id && entry.type === 'yes_no'
                    ? { ...entry, value: true }
                    : entry,
                ),
              )
            }
            type="button"
            variant={field.value === true ? 'secondary' : 'outline'}
          >
            Yes
          </Button>
          <Button
            aria-pressed={field.value === false}
            onClick={() =>
              setFeedback((current) =>
                current.map((entry) =>
                  entry.id === field.id && entry.type === 'yes_no'
                    ? { ...entry, value: false }
                    : entry,
                ),
              )
            }
            type="button"
            variant={field.value === false ? 'secondary' : 'outline'}
          >
            No
          </Button>
        </div>
      );
    case 'emoji':
      return (
        <div aria-label={`${field.label} options`} className="flex flex-wrap gap-2" role="group">
          {field.options.map((option) => {
            const isSelected = field.value === option;

            return (
              <Button
                aria-pressed={isSelected}
                className="min-w-11 px-3"
                key={option}
                onClick={() =>
                  setFeedback((current) =>
                    current.map((entry) =>
                      entry.id === field.id && entry.type === 'emoji'
                        ? { ...entry, value: option }
                        : entry,
                    ),
                  )
                }
                size="sm"
                type="button"
                variant={isSelected ? 'secondary' : 'outline'}
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {option}
                </span>
                <span className="sr-only">{option}</span>
              </Button>
            );
          })}
        </div>
      );
    case 'slider':
      return (
        <div className="space-y-2">
          <input
            aria-label={`${field.label} slider`}
            className="h-2 w-full cursor-pointer accent-[var(--color-accent-peach)]"
            max={field.max}
            min={field.min}
            onChange={(event) => {
              const nextValue = Number(event.target.value);

              setFeedback((current) =>
                current.map((entry) =>
                  entry.id === field.id && entry.type === 'slider'
                    ? { ...entry, value: Number.isNaN(nextValue) ? null : nextValue }
                    : entry,
                ),
              );
            }}
            step={field.step ?? 1}
            type="range"
            value={field.value ?? field.min}
          />
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{field.min}</span>
            <span className="font-medium text-foreground">{field.value ?? '-'}</span>
            <span>{field.max}</span>
          </div>
        </div>
      );
    case 'multi_select':
      return (
        <div aria-label={`${field.label} options`} className="flex flex-wrap gap-2" role="group">
          {field.options.map((option) => {
            const selectedValues = field.value ?? [];
            const isSelected = selectedValues.includes(option);

            return (
              <Button
                aria-pressed={isSelected}
                key={option}
                onClick={() =>
                  setFeedback((current) =>
                    current.map((entry) => {
                      if (entry.id !== field.id || entry.type !== 'multi_select') {
                        return entry;
                      }

                      return {
                        ...entry,
                        value: (entry.value ?? []).includes(option)
                          ? (entry.value ?? []).filter((item) => item !== option)
                          : [...(entry.value ?? []), option],
                      };
                    }),
                  )
                }
                size="sm"
                type="button"
                variant={isSelected ? 'secondary' : 'outline'}
              >
                {option}
              </Button>
            );
          })}
        </div>
      );
    default:
      return null;
  }
}
