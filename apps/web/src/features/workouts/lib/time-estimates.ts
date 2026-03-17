import type {
  ActiveWorkoutExercise,
  ActiveWorkoutSection,
  ActiveWorkoutSessionData,
} from '../types';

const DEFAULT_SECONDS_PER_REP = 3;

export function estimateExerciseTime(exercise: ActiveWorkoutExercise) {
  return estimateSingleExerciseTime(exercise, Math.max(exercise.targetSets, 0));
}

export function estimateRemainingExerciseTime(exercise: ActiveWorkoutExercise) {
  return estimateSingleExerciseTime(
    exercise,
    Math.max(exercise.targetSets - exercise.completedSets, 0),
  );
}

export function estimateSectionTime(section: ActiveWorkoutSection) {
  return estimateSectionByGroup(section, (exercise) => Math.max(exercise.targetSets, 0));
}

export function estimateRemainingSectionTime(section: ActiveWorkoutSection) {
  return estimateSectionByGroup(section, (exercise) =>
    Math.max(exercise.targetSets - exercise.completedSets, 0),
  );
}

export function estimateTotalTime(session: ActiveWorkoutSessionData) {
  return session.sections.reduce((total, section) => total + estimateSectionTime(section), 0);
}

export function estimateRemainingTime(session: ActiveWorkoutSessionData) {
  return session.sections.reduce(
    (total, section) => total + estimateRemainingSectionTime(section),
    0,
  );
}

export function formatEstimateMinutes(totalSeconds: number) {
  const safeSeconds = Math.max(totalSeconds, 0);
  const roundedMinutes = Math.round(safeSeconds / 60);

  return `~${roundedMinutes} min`;
}

export function formatEstimateMinuteRange(totalSeconds: number) {
  const safeSeconds = Math.max(totalSeconds, 0);
  const roundedMinutes = Math.max(1, Math.round(safeSeconds / 60));
  const minMinutes = Math.max(1, roundedMinutes - 2);
  const maxMinutes = Math.max(minMinutes + 1, roundedMinutes + 2);

  return `${minMinutes}-${maxMinutes} min`;
}

export function formatRestDuration(totalSeconds: number) {
  const safeSeconds = Math.max(totalSeconds, 0);

  if (safeSeconds <= 90) {
    return `${safeSeconds}s`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m${seconds}s`;
}

export function formatTempo(tempo: string) {
  const segments = tempo
    .replace(/[^0-9]/g, '')
    .split('')
    .filter(Boolean);

  return segments.length > 0 ? segments.join('-') : tempo;
}

function estimateSectionByGroup(
  section: ActiveWorkoutSection,
  resolveSetCount: (exercise: ActiveWorkoutExercise) => number,
) {
  return groupExercisesForEstimate(section.exercises).reduce((total, group) => {
    if (group.length === 1) {
      return total + estimateSingleExerciseTime(group[0], resolveSetCount(group[0]));
    }

    return total + estimateSupersetGroupTime(group, resolveSetCount);
  }, 0);
}

function estimateSingleExerciseTime(exercise: ActiveWorkoutExercise, setCount: number) {
  const normalizedSetCount = Math.max(setCount, 0);

  if (normalizedSetCount === 0) {
    return 0;
  }

  const averageReps = estimateAverageReps(exercise.prescribedReps);
  const secondsPerRep = estimateSecondsPerRep(exercise.tempo);
  const repTime = secondsPerRep * averageReps;
  const totalWork = repTime * normalizedSetCount;
  const totalRest = Math.max(normalizedSetCount - 1, 0) * exercise.restSeconds;

  return Math.max(0, Math.round(totalWork + totalRest));
}

function estimateSupersetGroupTime(
  exercises: ActiveWorkoutExercise[],
  resolveSetCount: (exercise: ActiveWorkoutExercise) => number,
) {
  const entries = exercises
    .map((exercise) => {
      const setCount = Math.max(resolveSetCount(exercise), 0);
      const averageReps = estimateAverageReps(exercise.prescribedReps);
      const secondsPerRep = estimateSecondsPerRep(exercise.tempo);
      const workPerSet = averageReps * secondsPerRep;

      return {
        exercise,
        setCount,
        workPerSet,
      };
    })
    .filter((entry) => entry.setCount > 0);

  if (entries.length === 0) {
    return 0;
  }

  const totalWork = entries.reduce((total, entry) => total + entry.workPerSet * entry.setCount, 0);
  const roundCount = entries.reduce((max, entry) => Math.max(max, entry.setCount), 0);
  const trailingRestSeconds = entries[entries.length - 1].exercise.restSeconds;
  const totalRest = Math.max(roundCount - 1, 0) * trailingRestSeconds;

  return Math.max(0, Math.round(totalWork + totalRest));
}

function groupExercisesForEstimate(exercises: ActiveWorkoutExercise[]) {
  const groups: ActiveWorkoutExercise[][] = [];
  let index = 0;

  while (index < exercises.length) {
    const current = exercises[index];
    const groupId = current.supersetGroup;

    if (!groupId) {
      groups.push([current]);
      index += 1;
      continue;
    }

    let nextIndex = index + 1;
    while (nextIndex < exercises.length && exercises[nextIndex].supersetGroup === groupId) {
      nextIndex += 1;
    }

    if (nextIndex - index > 1) {
      groups.push(exercises.slice(index, nextIndex));
    } else {
      groups.push([current]);
    }

    index = nextIndex;
  }

  return groups;
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

  const normalizedTempo = tempo.trim();
  const parsedSegments = normalizedTempo.includes('-')
    ? normalizedTempo.split('-').map((segment) => Number.parseInt(segment.trim(), 10))
    : normalizedTempo
        .replace(/[^0-9]/g, '')
        .split('')
        .map((segment) => Number.parseInt(segment, 10));
  const segments = parsedSegments.filter((segment) => Number.isFinite(segment) && segment >= 0);

  if (segments.length === 0) {
    return DEFAULT_SECONDS_PER_REP;
  }

  const total = segments.reduce((sum, current) => sum + current, 0);

  return total > 0 ? total : DEFAULT_SECONDS_PER_REP;
}
