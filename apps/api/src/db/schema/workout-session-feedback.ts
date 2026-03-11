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

function isFeedbackResponseValueByType(type: string, value: unknown) {
  switch (type) {
    case 'scale':
    case 'slider':
      return typeof value === 'number' && Number.isFinite(value);
    case 'yes_no':
      return typeof value === 'boolean';
    case 'emoji':
      return typeof value === 'string' && value.trim().length > 0;
    case 'text':
      return value === null || typeof value === 'string';
    case 'multi_select':
      return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
    default:
      return false;
  }
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
            isFeedbackResponseValueByType(response.type, response.value) &&
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
    ? parsed.responses.map((response) => {
        const base = {
          id: response.id as string,
          label: response.label as string,
          ...(typeof response.notes === 'string' ? { notes: response.notes } : {}),
        };

        switch (response.type) {
          case 'scale':
          case 'slider':
            return {
              ...base,
              type: response.type,
              value: response.value as number,
            };
          case 'yes_no':
            return {
              ...base,
              type: 'yes_no' as const,
              value: response.value as boolean,
            };
          case 'emoji':
            return {
              ...base,
              type: 'emoji' as const,
              value: response.value as string,
            };
          case 'text':
            return {
              ...base,
              type: 'text' as const,
              value: response.value as string | null,
            };
          case 'multi_select':
            return {
              ...base,
              type: 'multi_select' as const,
              value: response.value as string[],
            };
          default:
            throw new TypeError(INVALID_WORKOUT_SESSION_FEEDBACK_ERROR);
        }
      })
    : undefined;

  return {
    energy: parsed.energy,
    recovery: parsed.recovery,
    technique: parsed.technique,
    ...(notes === undefined ? {} : { notes }),
    ...(responses === undefined ? {} : { responses }),
  };
}
