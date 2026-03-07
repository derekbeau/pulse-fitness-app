import { useState } from 'react';
import { CheckCircle2, Clock3, Dumbbell, ListChecks, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { accentCardStyles } from '@/lib/accent-card-styles';
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

type SessionSummaryProps = {
  className?: string;
  defaultDescription?: string;
  defaultTags?: string[];
  duration: string;
  exercisesCompleted: number;
  onDone: () => void;
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
  onDone,
  totalReps,
  totalSets,
  workoutName,
}: SessionSummaryProps) {
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
            <SummaryStat icon={ListChecks} label="Sets completed" value={`${totalSets}`} />
            <SummaryStat icon={CheckCircle2} label="Total reps" value={`${totalReps}`} />
            <SummaryStat icon={Clock3} label="Duration" value={duration} />
          </div>

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
              className="text-sm font-medium opacity-80 dark:text-muted dark:opacity-100"
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
              disabled={templateName.trim().length === 0}
              onClick={() => {
                const payload = {
                  name: templateName.trim(),
                  description: templateDescription.trim(),
                  tags: templateTags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                };

                console.log('Mock save workout template', payload);
                setSaveMessage(`Saved "${payload.name}" to mock templates.`);
                setIsSaveDialogOpen(false);
              }}
              type="button"
            >
              Save
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
