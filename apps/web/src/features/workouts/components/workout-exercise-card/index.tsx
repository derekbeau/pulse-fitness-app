import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { ExerciseHeader } from './exercise-header';
import { buildTemplateSetListItems, formatCompactSetSummary } from './formatters';
import { FormCuesBlock } from './form-cues-block';
import { LastPerformanceChip } from './last-performance-chip';
import { PrescriptionBlock } from './prescription-block';
import { ProgrammingNotesBlock } from './programming-notes-block';
import { WorkoutExerciseSetList } from './workout-exercise-set-list';

import type {
  WorkoutExerciseCardMode,
  WorkoutExerciseCardProps,
  WorkoutExerciseCardScheduledExercise,
  WorkoutExerciseCardTemplateExercise,
} from './types';

const WORKOUT_EXERCISE_CARD_TEST_ID_PREFIX = 'workout-exercise-card-';
const WORKOUT_EXERCISE_ELEMENT_ID_PREFIX = 'workout-exercise-';

export function getWorkoutExerciseCardTestId(exerciseId: string) {
  return `${WORKOUT_EXERCISE_CARD_TEST_ID_PREFIX}${exerciseId}`;
}

export function getWorkoutExerciseCardElementId(exerciseId: string) {
  return `${WORKOUT_EXERCISE_ELEMENT_ID_PREFIX}${exerciseId}`;
}

export function WorkoutExerciseCard(props: WorkoutExerciseCardProps) {
  const {
    cardRef,
    className,
    footerSlot,
    headerSlot,
    leadingSlot,
    mode,
    onOpenDetails,
    showLastPerformance = false,
    showSetList = true,
    style,
    weightUnit = 'lbs',
  } = props;

  const exercise = props.exercise;
  const setItems =
    mode === 'readonly-completed'
      ? props.exercise.completedSets
      : buildTemplateSetListItems({
          setTargets: props.exercise.setTargets,
          sets: props.exercise.sets,
          trackingType: props.exercise.trackingType,
        });

  const compactHint =
    mode === 'readonly-completed'
      ? null
      : formatCompactSetSummary(
          {
            repsMax: props.exercise.repsMax,
            repsMin: props.exercise.repsMin,
            setTargets: props.exercise.setTargets,
            sets: props.exercise.sets,
            trackingType: props.exercise.trackingType,
          },
          weightUnit,
        );
  const prescriptionSetTargets = 'setTargets' in exercise ? exercise.setTargets : null;
  const prescriptionSets = 'sets' in exercise ? exercise.sets : setItems.length;
  const cuesExercise =
    mode === 'readonly-completed'
      ? null
      : (exercise as WorkoutExerciseCardTemplateExercise | WorkoutExerciseCardScheduledExercise);
  const hasProgrammingNotes =
    typeof exercise.programmingNotes === 'string' && exercise.programmingNotes.trim().length > 0;
  const shouldShowFormCues =
    cuesExercise !== null &&
    ((cuesExercise.formCues?.length ?? 0) > 0 ||
      (cuesExercise.templateCues?.length ?? 0) > 0 ||
      (cuesExercise.sessionCues?.length ?? 0) > 0 ||
      (typeof cuesExercise.instructions === 'string' && cuesExercise.instructions.trim().length > 0) ||
      (typeof cuesExercise.coachingNotes === 'string' &&
        cuesExercise.coachingNotes.trim().length > 0));

  return (
    <Card
      className={cn('gap-1.5 py-0', className)}
      data-testid={getWorkoutExerciseCardTestId(exercise.id)}
      id={getWorkoutExerciseCardElementId(exercise.id)}
      ref={cardRef}
      style={style}
    >
      <CardHeader className="gap-1.5 py-2.5">
        <ExerciseHeader
          exercise={exercise}
          leadingSlot={leadingSlot}
          onOpenDetails={onOpenDetails}
          targetHint={compactHint}
          trailingSlot={headerSlot}
        />
      </CardHeader>

      <CardContent className="space-y-2 pb-2.5">
        {showLastPerformance ? (
          <LastPerformanceChip
            exerciseId={exercise.exerciseId}
            trackingType={exercise.trackingType}
            weightUnit={weightUnit}
          />
        ) : null}

        <PrescriptionBlock
          repsMax={exercise.repsMax}
          repsMin={exercise.repsMin}
          restSeconds={exercise.restSeconds}
          setTargets={prescriptionSetTargets}
          sets={prescriptionSets}
          tempo={exercise.tempo}
          trackingType={exercise.trackingType}
          weightUnit={weightUnit}
        />

        {hasProgrammingNotes ? (
          <ProgrammingNotesBlock
            notes={exercise.programmingNotes}
            testId={`exercise-programming-notes-${exercise.id}`}
          />
        ) : null}

        {shouldShowFormCues ? (
          <FormCuesBlock
            coachingNotes={cuesExercise?.coachingNotes}
            exerciseCues={cuesExercise?.formCues ?? []}
            instructions={cuesExercise?.instructions}
            sessionCues={cuesExercise?.sessionCues ?? []}
            templateCues={cuesExercise?.templateCues ?? []}
          />
        ) : null}

        {showSetList ? (
          <details className="rounded-xl border border-border/80 bg-secondary/20 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-muted">
              Show full set detail
            </summary>
            <div className="mt-2">
              <WorkoutExerciseSetList
                mode={mode}
                sets={setItems}
                trackingType={exercise.trackingType}
                weightUnit={weightUnit}
              />
            </div>
          </details>
        ) : null}

        {footerSlot}
      </CardContent>
    </Card>
  );
}

export type { WorkoutExerciseCardMode };
export type {
  WorkoutExerciseCardCompletedExercise,
  WorkoutExerciseCardScheduledExercise,
  WorkoutExerciseCardTemplateExercise,
  WorkoutExerciseSetListItem,
  WorkoutExerciseSetTarget,
} from './types';
