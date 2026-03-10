import { useState } from 'react';
import { CheckCircle2, Clock3, Dumbbell, ListChecks, Save } from 'lucide-react';

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
import { cn } from '@/lib/utils';

import type { ActiveWorkoutFeedbackDraft } from '../types';

type SessionSummaryProps = {
  className?: string;
  defaultDescription?: string;
  defaultTags?: string[];
  duration: string;
  exercisesCompleted: number;
  feedback?: ActiveWorkoutFeedbackDraft;
  onDone: () => void;
  sessionId?: string | null;
  completedSets: number;
  totalReps: number;
  totalSets: number;
  workoutName: string;
};

export function SessionSummary({
  className,
  defaultDescription = '',
  defaultTags = [],
  duration,
  exercisesCompleted,
  feedback = [],
  onDone,
  sessionId = null,
  completedSets,
  totalReps,
  totalSets,
  workoutName,
}: SessionSummaryProps) {
  const saveAsTemplateMutation = useSaveAsTemplate(sessionId);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState(workoutName);
  const [templateDescription, setTemplateDescription] = useState(defaultDescription);
  const [templateTags, setTemplateTags] = useState(defaultTags.join(', '));
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  return (
    <>
      <Card className={cn(`overflow-hidden py-0 shadow-lg ${accentCardStyles.mint}`, className)}>
        <CardContent className="space-y-5 px-5 py-6 sm:px-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/40 px-3 py-1 text-xs font-semibold tracking-[0.18em] uppercase dark:border-border dark:bg-secondary/60">
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
              Session complete
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">Workout summary</h1>
              <p className="max-w-2xl text-sm opacity-75 dark:text-muted dark:opacity-100">
                Logged, reflected, and ready to head back to the workouts overview.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryStat
              icon={Dumbbell}
              label="Exercises completed"
              value={`${exercisesCompleted}`}
            />
            <SummaryStat
              icon={ListChecks}
              label="Sets completed"
              value={`${completedSets}/${totalSets}`}
            />
            <SummaryStat icon={CheckCircle2} label="Total reps" value={`${totalReps}`} />
            <SummaryStat icon={Clock3} label="Duration" value={duration} />
          </div>

          {feedback.length > 0 ? (
            <section className="space-y-3 rounded-3xl border border-black/10 bg-white/35 p-4 dark:border-border dark:bg-secondary/50">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Session feedback</h2>
                <p className="text-sm opacity-75 dark:text-muted dark:opacity-100">
                  Saved check-ins from the end of this workout.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {feedback.map((field) => (
                  <div
                    className="rounded-2xl border border-black/10 bg-white/45 p-4 dark:border-border dark:bg-card"
                    key={field.id}
                  >
                    <p className="text-xs font-semibold tracking-[0.18em] uppercase opacity-65 dark:text-muted dark:opacity-100">
                      {field.label}
                    </p>
                    <p className="mt-2 text-base font-semibold text-foreground">
                      {field.type === 'scale'
                        ? `${field.value ?? '-'} / ${field.max}`
                        : field.value}
                    </p>
                    {field.notes?.trim() ? (
                      <p className="mt-2 text-sm text-muted">{field.notes.trim()}</p>
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
                setTemplateTags(defaultTags.join(', '));
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
              onClick={onDone}
              type="button"
              variant="secondary"
            >
              Done
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
              <Input
                id="template-tags"
                onChange={(event) => setTemplateTags(event.target.value)}
                placeholder="strength, upper-body, gym"
                value={templateTags}
              />
              <p className="text-xs text-muted">Separate tags with commas.</p>
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
                  tags: templateTags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
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

                console.log('Mock save workout template', payload);
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

function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/40 p-4 dark:border-border dark:bg-secondary/60">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase opacity-65 dark:text-muted dark:opacity-100">
        <Icon aria-hidden="true" className="size-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
