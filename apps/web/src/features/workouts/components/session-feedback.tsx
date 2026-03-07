import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import type { ActiveWorkoutCustomFeedbackField, ActiveWorkoutFeedbackDraft } from '../types';

type SessionFeedbackProps = {
  className?: string;
  fields: ActiveWorkoutCustomFeedbackField[];
  onSubmit: (feedback: ActiveWorkoutFeedbackDraft) => void;
};

export function SessionFeedback({ className, fields, onSubmit }: SessionFeedbackProps) {
  const [feedback, setFeedback] = useState<ActiveWorkoutFeedbackDraft>(() =>
    fields.map((field) =>
      field.type === 'scale'
        ? {
            ...field,
            notes: field.notes ?? '',
            value: field.value ?? null,
          }
        : {
            ...field,
            notes: field.notes ?? '',
            value: field.value ?? '',
          },
    ),
  );

  const isComplete = feedback.every((field) => {
    if (field.type === 'scale') {
      return field.value !== null && field.value !== undefined;
    }

    if (field.optional) {
      return true;
    }

    return (field.value ?? '').trim().length > 0;
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
            Capture the custom check-ins for this session before you wrap the workout.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-5 py-5 sm:px-6">
        {feedback.map((field) => (
          <section className="rounded-3xl border border-border bg-secondary/25 p-4" key={field.id}>
            <div className="space-y-3">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">{field.label}</h3>
                <p className="text-sm text-muted">
                  {field.type === 'scale'
                    ? `Rate ${field.label.toLowerCase()} from ${field.min} to ${field.max}.`
                    : `Add a note for ${field.label.toLowerCase()}.`}
                </p>
              </div>

              {field.type === 'scale' ? (
                <div
                  aria-label={`${field.label} rating`}
                  className="flex flex-wrap gap-2"
                  role="group"
                >
                  {Array.from(
                    { length: field.max - field.min + 1 },
                    (_, index) => field.min + index,
                  ).map((score) => {
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
                  })}
                </div>
              ) : (
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
              )}

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
