import type { WorkoutSessionTimeSegment } from './workout-sessions.js';

const INVALID_WORKOUT_SESSION_TIME_SEGMENTS_ERROR =
  'Expected a JSON-encoded workout session time segments array.';

function isSegmentRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidTimeSegment(value: unknown): value is WorkoutSessionTimeSegment {
  if (!isSegmentRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('start') || !keys.includes('end')) {
    return false;
  }

  return typeof value.start === 'string' && (value.end === null || typeof value.end === 'string');
}

export function serializeWorkoutSessionTimeSegments(
  value: WorkoutSessionTimeSegment[] | null | undefined,
): string {
  if (value == null) {
    return '[]';
  }

  return JSON.stringify(value);
}

export function parseWorkoutSessionTimeSegments(
  value: string | null | undefined,
): WorkoutSessionTimeSegment[] {
  if (value == null) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError(INVALID_WORKOUT_SESSION_TIME_SEGMENTS_ERROR);
  }

  if (!Array.isArray(parsed) || parsed.some((segment) => !isValidTimeSegment(segment))) {
    throw new TypeError(INVALID_WORKOUT_SESSION_TIME_SEGMENTS_ERROR);
  }

  return parsed.map((segment) => ({
    start: segment.start,
    end: segment.end,
  }));
}
