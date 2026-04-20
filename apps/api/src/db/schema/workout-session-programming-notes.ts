export type WorkoutSessionExerciseProgrammingNotes = Record<string, string | null>;

const INVALID_WORKOUT_SESSION_PROGRAMMING_NOTES_ERROR =
  'Expected a JSON-encoded workout session programming notes record.';

function isProgrammingNotesRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function serializeWorkoutSessionExerciseProgrammingNotes(
  value: WorkoutSessionExerciseProgrammingNotes | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  if (
    !isProgrammingNotesRecord(value) ||
    Object.values(value).some((entry) => entry !== null && typeof entry !== 'string')
  ) {
    throw new TypeError(INVALID_WORKOUT_SESSION_PROGRAMMING_NOTES_ERROR);
  }

  return JSON.stringify(value);
}

export function parseWorkoutSessionExerciseProgrammingNotes(
  value: string | null | undefined,
): WorkoutSessionExerciseProgrammingNotes {
  if (value == null) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError(INVALID_WORKOUT_SESSION_PROGRAMMING_NOTES_ERROR);
  }

  if (
    !isProgrammingNotesRecord(parsed) ||
    Object.values(parsed).some((entry) => entry !== null && typeof entry !== 'string')
  ) {
    throw new TypeError(INVALID_WORKOUT_SESSION_PROGRAMMING_NOTES_ERROR);
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, entry]) => [key, entry === null ? null : String(entry)]),
  );
}
