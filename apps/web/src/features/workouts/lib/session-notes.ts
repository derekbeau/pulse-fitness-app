import type {
  ExerciseTrackingType,
  SessionSet,
  SessionSetInput,
  WorkoutTemplateSectionType,
} from '@pulse/shared';

import type { ActiveWorkoutSetDrafts, ActiveWorkoutTemplate } from '@/features/workouts/types';
import { getWorkoutOccurrenceId } from './active-session';
import { isRepTrackingType, isTimeBasedTrackingType, isWeightedTrackingType } from './tracking';

type TemplateExerciseLookup = Map<
  string,
  {
    exercise: ActiveWorkoutTemplate['sections'][number]['exercises'][number];
    section: WorkoutTemplateSectionType;
    trackingType: ExerciseTrackingType;
  }
>;

export function extractExerciseNotes(
  sessionSets: SessionSet[],
  resolveOccurrenceId: (set: SessionSet) => string | null = (set) =>
    set.exerciseId ?? null,
) {
  const exerciseNotes: Record<string, string> = {};
  const sortedSessionSets = [...sessionSets].sort((left, right) => {
    const leftExerciseId = resolveOccurrenceId(left) ?? '';
    const rightExerciseId = resolveOccurrenceId(right) ?? '';
    if (leftExerciseId !== rightExerciseId) {
      return leftExerciseId.localeCompare(rightExerciseId);
    }

    if (left.setNumber !== right.setNumber) {
      return left.setNumber - right.setNumber;
    }

    return left.createdAt - right.createdAt;
  });

  for (const set of sortedSessionSets) {
    const occurrenceId = resolveOccurrenceId(set);
    if (!occurrenceId) {
      continue;
    }

    const normalizedNotes = normalizeExerciseNote(set.notes);
    if (!normalizedNotes || exerciseNotes[occurrenceId]) {
      continue;
    }

    exerciseNotes[occurrenceId] = normalizedNotes;
  }

  return exerciseNotes;
}

export function buildSessionSetInputs(
  setDrafts: ActiveWorkoutSetDrafts,
  templateExerciseById: TemplateExerciseLookup,
  exerciseNotes: Record<string, string>,
  exerciseOrderIndexById: Record<string, number> = {},
): SessionSetInput[] {
  const sessionSets: SessionSetInput[] = [];

  for (const [occurrenceId, draftSets] of Object.entries(setDrafts)) {
    const templateExercise = templateExerciseById.get(occurrenceId);
    if (!templateExercise) continue;
    const exerciseId = templateExercise.exercise.exerciseId;
    const normalizedExerciseNote = normalizeExerciseNote(exerciseNotes[occurrenceId]);
    const trackingType = templateExercise?.trackingType ?? 'weight_reps';
    const tracksDistance = trackingType === 'distance' || trackingType === 'cardio';

    for (const draftSet of [...draftSets].sort((left, right) => left.number - right.number)) {
      sessionSets.push({
        completed: draftSet.completed,
        exerciseId,
        orderIndex: exerciseOrderIndexById[occurrenceId] ?? 0,
        notes: normalizedExerciseNote && draftSet.number === 1 ? normalizedExerciseNote : null,
        reps: isRepTrackingType(trackingType) ? draftSet.reps : null,
        seconds: isTimeBasedTrackingType(trackingType) ? draftSet.seconds : null,
        distance: tracksDistance ? draftSet.distance : null,
        ...(draftSet.rpe !== undefined && draftSet.rpe !== null ? { rpe: draftSet.rpe } : {}),
        ...(draftSet.rir !== undefined && draftSet.rir !== null ? { rir: draftSet.rir } : {}),
        section: templateExercise?.section ?? null,
        setNumber: draftSet.number,
        skipped: false,
        supersetGroup: templateExercise?.exercise.supersetGroup ?? null,
        weight: isWeightedTrackingType(trackingType) ? draftSet.weight : null,
        ...(draftSet.zone !== undefined && draftSet.zone !== null ? { zone: draftSet.zone } : {}),
      });
    }
  }

  return sessionSets;
}

export function buildExerciseNotesPayload(
  template: ActiveWorkoutTemplate,
  exerciseNotes: Record<string, string>,
) {
  return Object.fromEntries(
    template.sections.flatMap((section) =>
      section.exercises.flatMap((exercise) => {
        const note = exerciseNotes[getWorkoutOccurrenceId(exercise, section.type)]?.trim();
        return note ? [[`${exercise.exerciseId}::${section.type}`, note]] : [];
      }),
    ),
  );
}

function normalizeExerciseNote(note: string | null | undefined) {
  const normalized = note?.trim();
  return normalized ? normalized : null;
}
