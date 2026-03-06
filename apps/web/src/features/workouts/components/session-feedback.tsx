import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import type { ActiveWorkoutFeedbackDraft, ActiveWorkoutFeedbackQuestion } from '../types';

type SessionFeedbackProps = {
  className?: string;
  onSubmit: (feedback: ActiveWorkoutFeedbackDraft) => void;
};

const feedbackQuestions: Array<{
  id: ActiveWorkoutFeedbackQuestion;
  prompt: string;
  title: string;
}> = [
  {
    id: 'energy',
    prompt: 'How was your energy level?',
    title: 'Energy',
  },
  {
    id: 'recovery',
    prompt: 'How recovered did you feel?',
    title: 'Recovery',
  },
  {
    id: 'technique',
    prompt: 'How was your form/technique?',
    title: 'Technique',
  },
];

export function SessionFeedback({ className, onSubmit }: SessionFeedbackProps) {
  const [feedback, setFeedback] = useState<ActiveWorkoutFeedbackDraft>(() =>
    Object.fromEntries(
      feedbackQuestions.map((question) => [
        question.id,
        {
          note: '',
          score: null,
        },
      ]),
    ) as ActiveWorkoutFeedbackDraft,
  );

  const isComplete = feedbackQuestions.every((question) => feedback[question.id].score !== null);

  return (
    <Card className={cn('overflow-hidden py-0 shadow-sm', className)}>
      <CardHeader className="gap-3 border-b border-border bg-[var(--color-accent-pink)] py-6 text-[var(--color-on-accent)]">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-[0.22em] text-[var(--color-on-accent)]/70 uppercase">
            Post-workout feedback
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">How did this session feel?</h1>
          <p className="max-w-2xl text-sm text-[var(--color-on-accent)]/75">
            Capture a quick read on energy, recovery, and technique before you wrap the
            workout.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-5 py-5 sm:px-6">
        {feedbackQuestions.map((question) => (
          <section className="rounded-3xl border border-border bg-secondary/25 p-4" key={question.id}>
            <div className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">{question.title}</h2>
                <p className="text-sm text-muted">{question.prompt}</p>
              </div>

              <div aria-label={`${question.title} rating`} className="flex flex-wrap gap-2" role="group">
                {[1, 2, 3, 4, 5].map((score) => {
                  const isSelected = feedback[question.id].score === score;

                  return (
                    <Button
                      aria-pressed={isSelected}
                      className={cn(
                        'min-w-11',
                        isSelected &&
                          'border-transparent bg-[var(--color-accent-cream)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-cream)]/90',
                      )}
                      key={score}
                      onClick={() =>
                        setFeedback((current) => ({
                          ...current,
                          [question.id]: {
                            ...current[question.id],
                            score: score as 1 | 2 | 3 | 4 | 5,
                          },
                        }))
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

              <div className="space-y-2">
                <label
                  className="text-xs font-semibold tracking-[0.18em] text-muted uppercase"
                  htmlFor={`${question.id}-notes`}
                >
                  Optional notes
                </label>
                <Textarea
                  id={`${question.id}-notes`}
                  onChange={(event) =>
                    setFeedback((current) => ({
                      ...current,
                      [question.id]: {
                        ...current[question.id],
                        note: event.target.value,
                      },
                    }))
                  }
                  placeholder={`Add a note about ${question.title.toLowerCase()} if it mattered today.`}
                  value={feedback[question.id].note}
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
