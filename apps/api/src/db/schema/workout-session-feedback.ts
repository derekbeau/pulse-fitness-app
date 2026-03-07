import type { WorkoutSessionFeedback } from './workout-sessions.js';

const INVALID_WORKOUT_SESSION_FEEDBACK_ERROR =
  'Expected a JSON-encoded workout session feedback object.';

const WORKOUT_SESSION_FEEDBACK_KEYS = ['energy', 'recovery', 'technique', 'notes'] as const;

function isFeedbackRating(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

function isFeedbackRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function serializeWorkoutSessionFeedback(
  value: WorkoutSessionFeedback | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  return JSON.stringify(value);
}

export function parseWorkoutSessionFeedback(
  value: string | null | undefined,
): WorkoutSessionFeedback | null {
  if (value == null) {
    return null;
  }

  const parsed: unknown = JSON.parse(value);
  if (
    !isFeedbackRecord(parsed) ||
    !isFeedbackRating(parsed.energy) ||
    !isFeedbackRating(parsed.recovery) ||
    !isFeedbackRating(parsed.technique) ||
    ('notes' in parsed && parsed.notes !== undefined && typeof parsed.notes !== 'string') ||
    Object.keys(parsed).some(
      (key) => !WORKOUT_SESSION_FEEDBACK_KEYS.includes(key as (typeof WORKOUT_SESSION_FEEDBACK_KEYS)[number]),
    )
  ) {
    throw new TypeError(INVALID_WORKOUT_SESSION_FEEDBACK_ERROR);
  }

  const notes = typeof parsed.notes === 'string' ? parsed.notes : undefined;

  return {
    energy: parsed.energy,
    recovery: parsed.recovery,
    technique: parsed.technique,
    ...(notes === undefined ? {} : { notes }),
  };
}
