import type {
  ExerciseTrackingType,
  SessionSet,
  SessionSetInput,
  WorkoutTemplateSectionType,
} from '@pulse/shared';

import type { ActiveWorkoutSetDrafts, ActiveWorkoutTemplate } from '@/features/workouts/types';
import { isRepTrackingType, isTimeBasedTrackingType, isWeightedTrackingType } from './tracking';

type TemplateExerciseLookup = Map<
  string,
  {
    exercise: ActiveWorkoutTemplate['sections'][number]['exercises'][number];
    section: WorkoutTemplateSectionType;
    trackingType: ExerciseTrackingType;
  }
>;

export function extractExerciseNotes(sessionSets: SessionSet[]) {
  const exerciseNotes: Record<string, string> = {};
  const sortedSessionSets = [...sessionSets].sort((left, right) => {
    const leftExerciseId = left.exerciseId ?? '';
    const rightExerciseId = right.exerciseId ?? '';
    if (leftExerciseId !== rightExerciseId) {
      return leftExerciseId.localeCompare(rightExerciseId);
    }

    if (left.setNumber !== right.setNumber) {
      return left.setNumber - right.setNumber;
    }

    return left.createdAt - right.createdAt;
  });

  for (const set of sortedSessionSets) {
    if (!set.exerciseId) {
      continue;
    }

    const normalizedNotes = normalizeExerciseNote(set.notes);
    if (!normalizedNotes || exerciseNotes[set.exerciseId]) {
      continue;
    }

    exerciseNotes[set.exerciseId] = normalizedNotes;
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

  for (const [exerciseId, draftSets] of Object.entries(setDrafts)) {
    const templateExercise = templateExerciseById.get(exerciseId);
    const normalizedExerciseNote = normalizeExerciseNote(exerciseNotes[exerciseId]);
    const trackingType = templateExercise?.trackingType ?? 'weight_reps';
    const tracksDistance = trackingType === 'distance' || trackingType === 'cardio';

    for (const draftSet of [...draftSets].sort((left, right) => left.number - right.number)) {
      sessionSets.push({
        completed: draftSet.completed,
        exerciseId,
        orderIndex: exerciseOrderIndexById[exerciseId] ?? 0,
        notes: normalizedExerciseNote && draftSet.number === 1 ? normalizedExerciseNote : null,
        reps: isRepTrackingType(trackingType) ? draftSet.reps : null,
        seconds: isTimeBasedTrackingType(trackingType) ? draftSet.seconds : null,
        distance: tracksDistance ? draftSet.distance : null,
        ...(draftSet.rpe !== undefined && draftSet.rpe !== null ? { rpe: draftSet.rpe } : {}),
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

function normalizeExerciseNote(note: string | null | undefined) {
  const normalized = note?.trim();
  return normalized ? normalized : null;
}
