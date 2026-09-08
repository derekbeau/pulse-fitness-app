import type { ExerciseTrackingType } from '../schemas/exercises.js';

type HistoricalSet = {
  completed: boolean;
  skipped?: boolean;
  weight?: number | null;
  reps?: number | null;
  seconds?: number | null;
  distance?: number | null;
};

/** Performance for a related-history preview, not validation for logging a new set.
 * Recorded zero is a value. Load or effort alone does not establish performance.
 * Keep the legacy reps-as-time/distance bridge used by compact history previews.
 */
export function isMeaningfulCompletedSet(set: HistoricalSet, trackingType: ExerciseTrackingType) {
  if (!set.completed || set.skipped === true) return false;

  switch (trackingType) {
    case 'weight_reps':
    case 'bodyweight_reps':
    case 'reps_only':
      return set.reps != null;
    case 'weight_seconds':
    case 'seconds_only':
    case 'duration':
      return (set.seconds ?? set.reps) != null;
    case 'reps_seconds':
      return set.reps != null || set.seconds != null;
    case 'distance':
      return (set.distance ?? set.reps) != null;
    case 'cardio':
      return (set.seconds ?? set.reps) != null || set.distance != null;
  }
}
