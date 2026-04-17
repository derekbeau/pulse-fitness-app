import type { WorkoutSessionTimeSegment } from './workout-sessions.js';

const INVALID_WORKOUT_SESSION_TIME_SEGMENTS_ERROR =
  'Expected a JSON-encoded workout session time segments array.';
const WORKOUT_SECTIONS = ['warmup', 'main', 'cooldown', 'supplemental'] as const;
type WorkoutSection = (typeof WORKOUT_SECTIONS)[number];
type LegacyWorkoutSessionTimeSegment = Omit<WorkoutSessionTimeSegment, 'section'> &
  Partial<Pick<WorkoutSessionTimeSegment, 'section'>>;

function isSegmentRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWorkoutSection(value: unknown): value is WorkoutSection {
  return typeof value === 'string' && WORKOUT_SECTIONS.includes(value as WorkoutSection);
}

function isValidTimeSegmentWriteShape(value: unknown): value is WorkoutSessionTimeSegment {
  if (!isSegmentRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  if (
    keys.length !== 3 ||
    !keys.includes('start') ||
    !keys.includes('end') ||
    !keys.includes('section')
  ) {
    return false;
  }

  return (
    typeof value.start === 'string' &&
    (value.end === null || typeof value.end === 'string') &&
    isWorkoutSection(value.section)
  );
}

function isValidTimeSegmentReadShape(value: unknown): value is LegacyWorkoutSessionTimeSegment {
  if (!isSegmentRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  const isLegacyShape = keys.length === 2 && keys.includes('start') && keys.includes('end');
  const isCurrentShape =
    keys.length === 3 && keys.includes('start') && keys.includes('end') && keys.includes('section');
  if (!isLegacyShape && !isCurrentShape) {
    return false;
  }

  return (
    typeof value.start === 'string' &&
    (value.end === null || typeof value.end === 'string') &&
    (value.section === undefined || isWorkoutSection(value.section))
  );
}

export function serializeWorkoutSessionTimeSegments(
  value: WorkoutSessionTimeSegment[] | null | undefined,
): string {
  if (value == null) {
    return '[]';
  }

  if (value.some((segment) => !isValidTimeSegmentWriteShape(segment))) {
    throw new TypeError(INVALID_WORKOUT_SESSION_TIME_SEGMENTS_ERROR);
  }

  return JSON.stringify(value);
}

export function parseWorkoutSessionTimeSegments(
  value: string | null | undefined,
): LegacyWorkoutSessionTimeSegment[] {
  if (value == null) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError(INVALID_WORKOUT_SESSION_TIME_SEGMENTS_ERROR);
  }

  if (!Array.isArray(parsed) || parsed.some((segment) => !isValidTimeSegmentReadShape(segment))) {
    throw new TypeError(INVALID_WORKOUT_SESSION_TIME_SEGMENTS_ERROR);
  }

  return parsed.map((segment) => ({
    start: segment.start,
    end: segment.end,
    ...(segment.section ? { section: segment.section } : {}),
  }));
}
