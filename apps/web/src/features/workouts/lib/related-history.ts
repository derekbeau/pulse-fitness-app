import { isMeaningfulCompletedSet } from '@pulse/shared';

import type { ActiveWorkoutRelatedLastPerformance } from '../types';

export function selectRelatedHistory(related: ActiveWorkoutRelatedLastPerformance[]) {
  return related.flatMap((exercise) => {
    if (exercise.history == null) return [];
    const sets = exercise.history.sets.filter((set) =>
      isMeaningfulCompletedSet(set, exercise.trackingType),
    );
    return sets.length > 0 ? [{ ...exercise, history: { ...exercise.history, sets } }] : [];
  });
}
