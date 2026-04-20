import { Link } from 'react-router';
import { CalendarClock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ScheduledWorkoutHeaderProps = {
  isMutating: boolean;
  isTemplateAvailable: boolean;
  onCancel: () => void;
  onReschedule: () => void;
  onStart: () => void;
  scheduledDateLabel: string;
  templateId: string | null;
  templateName: string | null;
};

export function ScheduledWorkoutHeader({
  isMutating,
  isTemplateAvailable,
  onCancel,
  onReschedule,
  onStart,
  scheduledDateLabel,
  templateId,
  templateName,
}: ScheduledWorkoutHeaderProps) {
  return (
    <Card className="gap-4 overflow-hidden border-transparent bg-card/80 py-0">
      <CardContent className="space-y-4 bg-[var(--color-accent-cream)] px-6 py-6 text-on-cream dark:border-b dark:border-border dark:bg-card dark:text-foreground">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.22em] text-on-cream/80 uppercase dark:text-muted">
            Scheduled workout
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {templateName ?? 'Workout unavailable'}
          </h1>
          <p className="flex items-center gap-1.5 text-sm text-on-cream/85 dark:text-muted">
            <CalendarClock aria-hidden="true" className="size-4" />
            {scheduledDateLabel}
          </p>
          {templateId ? (
            <p className="text-sm text-on-cream/85 dark:text-muted">
              Template:{' '}
              <Link className="font-medium underline" to={`/workouts/template/${templateId}`}>
                {templateName ?? 'Unavailable template'}
              </Link>
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isMutating || !isTemplateAvailable}
            onClick={onStart}
            size="sm"
            type="button"
          >
            Start workout
          </Button>
          <Button
            disabled={isMutating || !isTemplateAvailable}
            onClick={onReschedule}
            size="sm"
            type="button"
            variant="outline"
          >
            Reschedule
          </Button>
          <Button
            disabled={isMutating}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Badge
            className={cn(
              'w-fit border-transparent bg-secondary text-secondary-foreground',
              !isTemplateAvailable ? 'bg-destructive/10 text-destructive' : null,
            )}
            variant="outline"
          >
            {isTemplateAvailable ? 'Scheduled' : 'Unavailable'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
