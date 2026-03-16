import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, CalendarClock, Dumbbell, TriangleAlert } from 'lucide-react';
import type { WorkoutTemplate } from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { useStartSession } from '@/hooks/use-workout-session';
import { toDateKey } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

import {
  useRescheduleWorkout,
  useScheduledWorkoutDetail,
  useUnscheduleWorkout,
  useWorkoutSessions,
} from '../api/workouts';
import { buildInitialSessionSets } from '../lib/workout-session-sets';
import { ScheduleWorkoutDialog } from './schedule-workout-dialog';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const sectionLabels: Record<string, string> = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
};

const sectionAccentStyles: Record<string, string> = {
  warmup: 'border-amber-500/30',
  main: 'border-primary/30',
  cooldown: 'border-sky-500/30',
};

type ScheduledWorkoutDetailProps = {
  id: string;
};

export function ScheduledWorkoutDetail({ id }: ScheduledWorkoutDetailProps) {
  const navigate = useNavigate();
  const { data: scheduledWorkout, isLoading, isError } = useScheduledWorkoutDetail(id);
  const startSessionMutation = useStartSession();
  const rescheduleWorkoutMutation = useRescheduleWorkout();
  const unscheduleWorkoutMutation = useUnscheduleWorkout();
  const { confirm, dialog: confirmDialog } = useConfirmation();
  const activeSessionsQuery = useWorkoutSessions({ status: ['in-progress', 'paused'] });
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);

  const template = scheduledWorkout?.template ?? null;
  const isTemplateAvailable = template !== null;
  const isMutating =
    startSessionMutation.isPending ||
    rescheduleWorkoutMutation.isPending ||
    unscheduleWorkoutMutation.isPending;

  async function doStart() {
    if (!scheduledWorkout || !template || !scheduledWorkout.templateId) {
      return;
    }

    const startedAt = Date.now();
    const session = await startSessionMutation.mutateAsync({
      date: toDateKey(new Date(startedAt)),
      name: template.name,
      sets: buildInitialSessionSets(template),
      startedAt,
      templateId: scheduledWorkout.templateId,
    });
    navigate(`/workouts/active?template=${scheduledWorkout.templateId}&sessionId=${session.id}`);
  }

  function handleStart() {
    if (!scheduledWorkout) {
      return;
    }

    const todayKey = toDateKey(new Date());
    const activeSessions = activeSessionsQuery.data ?? [];

    if (scheduledWorkout.date !== todayKey) {
      confirm({
        title: 'Start workout early?',
        description: `This workout is scheduled for ${dateFormatter.format(new Date(`${scheduledWorkout.date}T12:00:00`))}. Starting now will begin it today instead.`,
        confirmLabel: 'Start now',
        onConfirm: () => {
          void doStart();
        },
      });
      return;
    }

    if (activeSessions.length > 0) {
      confirm({
        title: 'You already have an active workout',
        description: `You have ${activeSessions.length === 1 ? 'a workout' : `${activeSessions.length} workouts`} in progress. Starting another will create an additional session for today.`,
        confirmLabel: 'Start anyway',
        cancelLabel: 'Go back',
        onConfirm: () => {
          void doStart();
        },
      });
      return;
    }

    void doStart();
  }

  async function handleReschedule(requestedDate: string) {
    if (!scheduledWorkout) {
      return;
    }
    await rescheduleWorkoutMutation.mutateAsync({
      date: requestedDate,
      id: scheduledWorkout.id,
    });
  }

  async function handleRemoveFromSchedule() {
    if (!scheduledWorkout) {
      return;
    }
    await unscheduleWorkoutMutation.mutateAsync({ id: scheduledWorkout.id });
    navigate('/workouts');
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted">Loading scheduled workout…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !scheduledWorkout) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted">Scheduled workout not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const scheduledDate = new Date(`${scheduledWorkout.date}T12:00:00`);

  return (
    <div className="space-y-4">
      <BackLink />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl">{template?.name ?? 'Workout unavailable'}</CardTitle>
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <CalendarClock aria-hidden="true" className="size-4" />
                {dateFormatter.format(scheduledDate)}
              </p>
            </div>
            <Badge
              className={cn(
                'w-fit',
                isTemplateAvailable
                  ? 'bg-secondary text-muted-foreground'
                  : 'bg-destructive/10 text-destructive',
              )}
              variant="secondary"
            >
              {isTemplateAvailable ? 'Scheduled' : 'Unavailable'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!isTemplateAvailable ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
              The template for this workout has been deleted. You can remove this from your
              schedule.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isMutating || !isTemplateAvailable}
              onClick={() => {
                void handleStart();
              }}
              size="sm"
              type="button"
            >
              Start
            </Button>
            <Button
              disabled={isMutating || !isTemplateAvailable}
              onClick={() => setIsRescheduleDialogOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              Reschedule
            </Button>
          </div>
        </CardContent>
      </Card>

      {template ? <TemplateSections template={template} /> : null}

      {scheduledWorkout ? (
        <ScheduleWorkoutDialog
          description={`Move ${template?.name ?? 'this workout'} to a new date.`}
          initialDate={scheduledWorkout.date}
          isPending={rescheduleWorkoutMutation.isPending}
          onOpenChange={setIsRescheduleDialogOpen}
          onRemove={handleRemoveFromSchedule}
          onSubmitDate={handleReschedule}
          open={isRescheduleDialogOpen}
          disallowDateKey={scheduledWorkout.date}
          disallowDateMessage="Pick a different date to reschedule."
          submitLabel="Save"
          title="Reschedule workout"
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      to="/workouts"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Back to workouts
    </Link>
  );
}

function TemplateSections({ template }: { template: WorkoutTemplate }) {
  const nonEmptySections = template.sections.filter((section) => section.exercises.length > 0);

  if (nonEmptySections.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">No exercises in this template.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {nonEmptySections.map((section) => (
        <Card className={cn('border-l-4', sectionAccentStyles[section.type])} key={section.type}>
          <CardHeader className="gap-1 py-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
                {sectionLabels[section.type] ?? section.type}
              </h3>
              <span className="text-xs text-muted">
                {section.exercises.length} exercise{section.exercises.length === 1 ? '' : 's'}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pb-3">
            {section.exercises.map((exercise, index) => (
              <div
                className="flex items-center gap-3 rounded-lg border border-border bg-secondary/20 px-3 py-2"
                key={exercise.id}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {exercise.exerciseName}
                  </p>
                  <p className="text-xs text-muted">
                    {exercise.sets} set{exercise.sets === 1 ? '' : 's'}
                    {exercise.repsMin != null && exercise.repsMax != null
                      ? ` · ${exercise.repsMin}–${exercise.repsMax} reps`
                      : exercise.repsMin != null
                        ? ` · ${exercise.repsMin}+ reps`
                        : ''}
                    {exercise.restSeconds != null ? ` · ${exercise.restSeconds}s rest` : ''}
                  </p>
                </div>
                {exercise.supersetGroup ? (
                  <Badge className="shrink-0" variant="secondary">
                    {exercise.supersetGroup}
                  </Badge>
                ) : null}
                <Dumbbell aria-hidden="true" className="size-4 shrink-0 text-muted" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
