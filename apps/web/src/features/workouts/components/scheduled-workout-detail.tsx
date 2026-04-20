import { type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router';
import { History } from 'lucide-react';
import type {
  WorkoutTemplate,
  WorkoutTemplateExercise,
  WorkoutTemplateSectionType,
  WeightUnit,
} from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { useStartSession } from '@/hooks/use-workout-session';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { toDateKey } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

import {
  useRescheduleWorkout,
  useScheduledWorkoutDetail,
  useUnscheduleWorkout,
  useWorkoutSessions,
} from '../api/workouts';
import { buildInitialSessionSets } from '../lib/workout-session-sets';
import { ExerciseDetailModal } from './exercise-detail-modal';
import { ScheduleWorkoutDialog } from './schedule-workout-dialog';
import { ScheduledWorkoutHeader } from './scheduled-workout-header';
import {
  WorkoutExerciseCard,
  type WorkoutExerciseCardScheduledExercise,
} from './workout-exercise-card';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const sectionLabels: Record<WorkoutTemplateSectionType, string> = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
  supplemental: 'Supplemental',
};

const sectionAccentStyles: Record<WorkoutTemplateSectionType, string> = {
  warmup: 'border-l-[var(--color-accent-mint)]',
  main: 'border-l-[var(--color-accent-pink)]',
  cooldown: 'border-l-[var(--color-accent-cream)]',
  supplemental: 'border-l-[var(--color-accent-cream)]',
};

type ScheduledWorkoutDetailProps = {
  bannerSlot?: ReactNode;
  id: string;
};

export function ScheduledWorkoutDetail({ bannerSlot, id }: ScheduledWorkoutDetailProps) {
  const navigate = useNavigate();
  const { weightUnit } = useWeightUnit();
  const { data: scheduledWorkout, isLoading, isError } = useScheduledWorkoutDetail(id);
  const startSessionMutation = useStartSession();
  const rescheduleWorkoutMutation = useRescheduleWorkout();
  const unscheduleWorkoutMutation = useUnscheduleWorkout();
  const { confirm, dialog: confirmDialog } = useConfirmation();
  const activeSessionsQuery = useWorkoutSessions({ status: ['in-progress', 'paused'] });
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<{
    exerciseId: string;
    exerciseName: string;
  } | null>(null);

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

  async function handleCancel() {
    if (!scheduledWorkout) {
      return;
    }

    await unscheduleWorkoutMutation.mutateAsync({ id: scheduledWorkout.id });
    navigate('/workouts');
  }

  function confirmCancel() {
    confirm({
      title: 'Cancel this scheduled workout?',
      description:
        'This scheduled workout will be removed. Your template and exercise library are not affected.',
      confirmLabel: 'Cancel workout',
      variant: 'destructive',
      onConfirm: async () => {
        await handleCancel();
      },
    });
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">Loading scheduled workout…</p>
        </CardContent>
      </Card>
    );
  }

  if (isError || !scheduledWorkout) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">Scheduled workout not found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {bannerSlot}
      <ScheduledWorkoutHeader
        isMutating={isMutating}
        isTemplateAvailable={isTemplateAvailable}
        onCancel={confirmCancel}
        onReschedule={() => setIsRescheduleDialogOpen(true)}
        onStart={handleStart}
        scheduledDateLabel={dateFormatter.format(new Date(`${scheduledWorkout.date}T12:00:00`))}
        templateId={scheduledWorkout.templateId}
        templateName={template?.name ?? null}
      />

      {template ? (
        <ScheduledWorkoutSections
          onOpenHistory={(exercise) =>
            setHistoryTarget({
              exerciseId: exercise.exerciseId,
              exerciseName: exercise.exerciseName,
            })
          }
          template={template}
          weightUnit={weightUnit}
        />
      ) : null}

      <ScheduleWorkoutDialog
        description={`Move ${template?.name ?? 'this workout'} to a new date.`}
        disallowDateKey={scheduledWorkout.date}
        disallowDateMessage="Pick a different date to reschedule."
        initialDate={scheduledWorkout.date}
        isPending={rescheduleWorkoutMutation.isPending}
        onOpenChange={setIsRescheduleDialogOpen}
        onSubmitDate={handleReschedule}
        open={isRescheduleDialogOpen}
        submitLabel="Save"
        title="Reschedule workout"
      />

      {historyTarget ? (
        <ExerciseDetailModal
          context="receipt"
          exerciseId={historyTarget.exerciseId}
          onOpenChange={(open) => {
            if (!open) {
              setHistoryTarget(null);
            }
          }}
          open={historyTarget != null}
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}

function ScheduledWorkoutSections({
  onOpenHistory,
  template,
  weightUnit,
}: {
  onOpenHistory: (exercise: WorkoutTemplateExercise) => void;
  template: WorkoutTemplate;
  weightUnit: WeightUnit;
}) {
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
        <details
          className={cn(
            'overflow-hidden rounded-3xl border border-border border-l-4 bg-card shadow-sm',
            sectionAccentStyles[section.type],
          )}
          key={section.type}
          open={section.type === 'main'}
        >
          <summary className="cursor-pointer list-outside px-4 py-3">
            <div className="flex flex-col gap-1.5 pr-6 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold tracking-wide text-foreground">
                {sectionLabels[section.type]}
              </h2>
              <Badge className="border-transparent bg-secondary text-secondary-foreground" variant="outline">
                {`${section.exercises.length} exercise${section.exercises.length === 1 ? '' : 's'}`}
              </Badge>
            </div>
          </summary>

          <div className="space-y-1.5 border-t border-border/80 px-3 py-3 sm:px-4 sm:py-3">
            {section.exercises.map((exercise, index) => (
              <ScheduledExerciseCard
                exercise={exercise}
                index={index}
                key={exercise.id}
                onOpenHistory={() => onOpenHistory(exercise)}
                weightUnit={weightUnit}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function ScheduledExerciseCard({
  exercise,
  index,
  onOpenHistory,
  weightUnit,
}: {
  exercise: WorkoutTemplateExercise;
  index: number;
  onOpenHistory: () => void;
  weightUnit: WeightUnit;
}) {
  return (
    <WorkoutExerciseCard
      exercise={toWorkoutExerciseCardScheduledExercise(exercise)}
      footerSlot={
        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">{`Exercise #${index + 1}`}</p>
      }
      headerSlot={
        <Button
          aria-label={`Open ${exercise.exerciseName} history`}
          className="size-11 min-h-11 min-w-11"
          onClick={onOpenHistory}
          size="icon"
          type="button"
          variant="ghost"
        >
          <History aria-hidden="true" className="size-4" />
        </Button>
      }
      mode="readonly-scheduled"
      onOpenDetails={onOpenHistory}
      weightUnit={weightUnit}
    />
  );
}

function toWorkoutExerciseCardScheduledExercise(
  exercise: WorkoutTemplateExercise,
): WorkoutExerciseCardScheduledExercise {
  return {
    coachingNotes: exercise.exercise?.coachingNotes ?? null,
    equipment: null,
    exerciseId: exercise.exerciseId,
    formCues: exercise.exercise?.formCues ?? exercise.formCues ?? [],
    id: exercise.id,
    instructions: exercise.exercise?.instructions ?? null,
    muscleGroups: [],
    name: exercise.exerciseName,
    notes: exercise.notes,
    programmingNotes: exercise.programmingNotes ?? null,
    repsMax: exercise.repsMax,
    repsMin: exercise.repsMin,
    restSeconds: exercise.restSeconds,
    setTargets: exercise.setTargets ?? [],
    sets: exercise.sets,
    tempo: exercise.tempo,
    templateCues: exercise.cues,
    trackingType: exercise.trackingType,
  };
}
