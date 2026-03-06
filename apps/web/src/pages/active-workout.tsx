import { useState } from 'react';

import {
  SessionExerciseList,
  SessionHeader,
  buildActiveWorkoutSession,
  createWorkoutSetId,
} from '@/features/workouts';
import { mockTemplates } from '@/lib/mock-data/workouts';

const activeTemplate = mockTemplates.find((template) => template.id === 'upper-push');

export function ActiveWorkoutPage() {
  const [completedSetIds] = useState<string[]>(() => [
    createWorkoutSetId('row-erg', 1),
    createWorkoutSetId('banded-shoulder-external-rotation', 1),
    createWorkoutSetId('banded-shoulder-external-rotation', 2),
    createWorkoutSetId('incline-dumbbell-press', 1),
    createWorkoutSetId('incline-dumbbell-press', 2),
  ]);
  const [startTime] = useState(() => new Date(Date.now() - 16 * 60_000 - 23_000).toISOString());

  if (!activeTemplate) {
    return null;
  }

  const session = buildActiveWorkoutSession(activeTemplate, new Set(completedSetIds));

  return (
    <section className="space-y-5 pb-8">
      <SessionHeader
        className="sticky top-4 z-20"
        completedSets={session.completedSets}
        currentExercise={session.currentExercise}
        startTime={startTime}
        totalExercises={session.totalExercises}
        totalSets={session.totalSets}
        workoutName={session.workoutName}
      />

      <SessionExerciseList session={session} />
    </section>
  );
}
