import type {
  ActiveWorkoutExercise,
  ActiveWorkoutSection,
  ActiveWorkoutSessionData,
} from '../types';

const DEFAULT_SECONDS_PER_REP = 3;

export function estimateExerciseTime(exercise: ActiveWorkoutExercise) {
  const setCount = Math.max(exercise.targetSets, 0);

  if (setCount === 0) {
    return 0;
  }

  const averageReps = estimateAverageReps(exercise.prescribedReps);
  const secondsPerRep = estimateSecondsPerRep(exercise.tempo);
  const repTime = secondsPerRep * averageReps;

  return Math.max(0, Math.round(setCount * (repTime + exercise.restSeconds) - exercise.restSeconds));
}

export function estimateRemainingExerciseTime(exercise: ActiveWorkoutExercise) {
  const remainingSets = Math.max(exercise.targetSets - exercise.completedSets, 0);

  if (remainingSets === 0) {
    return 0;
  }

  const averageReps = estimateAverageReps(exercise.prescribedReps);
  const secondsPerRep = estimateSecondsPerRep(exercise.tempo);
  const repTime = secondsPerRep * averageReps;

  return Math.max(
    0,
    Math.round(remainingSets * (repTime + exercise.restSeconds) - exercise.restSeconds),
  );
}

export function estimateSectionTime(section: ActiveWorkoutSection) {
  return section.exercises.reduce((total, exercise) => total + estimateExerciseTime(exercise), 0);
}

export function estimateRemainingSectionTime(section: ActiveWorkoutSection) {
  return section.exercises.reduce(
    (total, exercise) => total + estimateRemainingExerciseTime(exercise),
    0,
  );
}

export function estimateTotalTime(session: ActiveWorkoutSessionData) {
  return session.sections.reduce((total, section) => total + estimateSectionTime(section), 0);
}

export function estimateRemainingTime(session: ActiveWorkoutSessionData) {
  return session.sections.reduce((total, section) => total + estimateRemainingSectionTime(section), 0);
}

export function formatEstimateMinutes(totalSeconds: number) {
  const safeSeconds = Math.max(totalSeconds, 0);
  const roundedMinutes = Math.round(safeSeconds / 60);

  return `~${roundedMinutes} min`;
}

export function formatRestDuration(totalSeconds: number) {
  const safeSeconds = Math.max(totalSeconds, 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
}

export function formatTempo(tempo: string) {
  const segments = tempo.replace(/[^0-9]/g, '').split('').filter(Boolean);

  return segments.length > 0 ? segments.join('-') : tempo;
}

function estimateAverageReps(prescribedReps: string) {
  const rangeMatch = prescribedReps.match(/(\d+)\s*-\s*(\d+)/);

  if (rangeMatch) {
    const low = Number.parseInt(rangeMatch[1], 10);
    const high = Number.parseInt(rangeMatch[2], 10);

    if (Number.isFinite(low) && Number.isFinite(high)) {
      return (low + high) / 2;
    }
  }

  const firstNumber = prescribedReps.match(/\d+(?:\.\d+)?/);

  if (!firstNumber) {
    return 10;
  }

  const parsed = Number.parseFloat(firstNumber[0]);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function estimateSecondsPerRep(tempo: string | null | undefined) {
  if (!tempo) {
    return DEFAULT_SECONDS_PER_REP;
  }

  const segments = tempo
    .split('-')
    .flatMap((segment) => segment.split(''))
    .map((segment) => Number.parseInt(segment, 10))
    .filter((segment) => Number.isFinite(segment) && segment >= 0);

  if (segments.length === 0) {
    return DEFAULT_SECONDS_PER_REP;
  }

  const total = segments.reduce((sum, current) => sum + current, 0);

  return total > 0 ? total : DEFAULT_SECONDS_PER_REP;
}
