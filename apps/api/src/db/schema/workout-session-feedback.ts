import type { WorkoutSessionFeedback } from './workout-sessions.js';

const INVALID_WORKOUT_SESSION_FEEDBACK_ERROR =
  'Expected a JSON-encoded workout session feedback object.';

const WORKOUT_SESSION_FEEDBACK_KEYS = [
  'energy',
  'recovery',
  'technique',
  'notes',
  'responses',
] as const;
const WORKOUT_SESSION_FEEDBACK_RESPONSE_KEYS = ['id', 'label', 'type', 'value', 'notes'] as const;
const WORKOUT_SESSION_FEEDBACK_RESPONSE_TYPES = new Set([
  'scale',
  'text',
  'yes_no',
  'emoji',
  'slider',
  'multi_select',
]);

function isFeedbackRating(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

function isFeedbackRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFeedbackResponseType(value: unknown): value is string {
  return typeof value === 'string' && WORKOUT_SESSION_FEEDBACK_RESPONSE_TYPES.has(value);
}

function isFeedbackResponseValue(value: unknown) {
  if (value === null) {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'boolean' || typeof value === 'string') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => typeof entry === 'string');
  }

  return false;
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

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError(INVALID_WORKOUT_SESSION_FEEDBACK_ERROR);
  }

  if (
    !isFeedbackRecord(parsed) ||
    !isFeedbackRating(parsed.energy) ||
    !isFeedbackRating(parsed.recovery) ||
    !isFeedbackRating(parsed.technique) ||
    ('notes' in parsed && parsed.notes !== undefined && typeof parsed.notes !== 'string') ||
    ('responses' in parsed &&
      parsed.responses !== undefined &&
      (!Array.isArray(parsed.responses) ||
        !parsed.responses.every(
          (response) =>
            isFeedbackRecord(response) &&
            typeof response.id === 'string' &&
            response.id.length > 0 &&
            typeof response.label === 'string' &&
            response.label.length > 0 &&
            isFeedbackResponseType(response.type) &&
            isFeedbackResponseValue(response.value) &&
            (!('notes' in response) ||
              response.notes === undefined ||
              typeof response.notes === 'string') &&
            Object.keys(response).every((key) =>
              WORKOUT_SESSION_FEEDBACK_RESPONSE_KEYS.includes(
                key as (typeof WORKOUT_SESSION_FEEDBACK_RESPONSE_KEYS)[number],
              ),
            ),
        ))) ||
    Object.keys(parsed).some(
      (key) =>
        !WORKOUT_SESSION_FEEDBACK_KEYS.includes(
          key as (typeof WORKOUT_SESSION_FEEDBACK_KEYS)[number],
        ),
    )
  ) {
    throw new TypeError(INVALID_WORKOUT_SESSION_FEEDBACK_ERROR);
  }

  const notes = typeof parsed.notes === 'string' ? parsed.notes : undefined;
  const responses = Array.isArray(parsed.responses)
    ? parsed.responses.map((response) => ({
        id: response.id as string,
        label: response.label as string,
        type: response.type as
          | 'scale'
          | 'text'
          | 'yes_no'
          | 'emoji'
          | 'slider'
          | 'multi_select',
        value: response.value as number | boolean | string | string[] | null,
        ...(typeof response.notes === 'string' ? { notes: response.notes } : {}),
      }))
    : undefined;

  return {
    energy: parsed.energy,
    recovery: parsed.recovery,
    technique: parsed.technique,
    ...(notes === undefined ? {} : { notes }),
    ...(responses === undefined ? {} : { responses }),
  };
}
