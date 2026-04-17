import type { WorkoutSection, WorkoutSessionTimeSegment } from '@pulse/shared';

type LegacyWorkoutSessionTimeSegment = Omit<WorkoutSessionTimeSegment, 'section'> &
  Partial<Pick<WorkoutSessionTimeSegment, 'section'>>;

export function backfillTimeSegmentSections(
  timeSegments: LegacyWorkoutSessionTimeSegment[],
): WorkoutSessionTimeSegment[] {
  return timeSegments.map((segment) => ({
    ...segment,
    section: segment.section ?? 'main',
  }));
}

export function closeOpenTimeSegment(
  timeSegments: WorkoutSessionTimeSegment[],
  endIso: string,
): WorkoutSessionTimeSegment[] {
  const next = timeSegments.map((segment) => ({ ...segment }));

  // No-op if all segments are already closed.
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index]?.end === null) {
      next[index] = {
        ...next[index],
        end: endIso,
      };
      break;
    }
  }

  return next;
}

export function findOpenTimeSegment(
  timeSegments: WorkoutSessionTimeSegment[],
): { index: number; segment: WorkoutSessionTimeSegment } | null {
  for (let index = timeSegments.length - 1; index >= 0; index -= 1) {
    const segment = timeSegments[index];
    if (segment?.end === null) {
      return { index, segment };
    }
  }

  return null;
}

export function openTimeSegment(
  timeSegments: WorkoutSessionTimeSegment[],
  startIso: string,
  section: WorkoutSection = 'main',
): WorkoutSessionTimeSegment[] {
  return [...timeSegments, { start: startIso, end: null, section }];
}

export function calculateActiveDuration(timeSegments: WorkoutSessionTimeSegment[]): number {
  let totalSeconds = 0;

  for (const segment of timeSegments) {
    if (segment.end === null) {
      continue;
    }

    const start = Date.parse(segment.start);
    const end = Date.parse(segment.end);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      continue;
    }

    totalSeconds += Math.floor((end - start) / 1000);
  }

  return totalSeconds;
}

const createSectionDurationMap = () =>
  ({
    warmup: 0,
    main: 0,
    cooldown: 0,
    supplemental: 0,
  }) satisfies Record<WorkoutSection, number>;

export function calculateSectionDurations(
  timeSegments: WorkoutSessionTimeSegment[],
): Record<WorkoutSection, number> {
  // Returns milliseconds per section (calculateActiveDuration returns seconds).
  const totals = createSectionDurationMap();

  for (const segment of timeSegments) {
    if (segment.end === null) {
      continue;
    }

    const start = Date.parse(segment.start);
    const end = Date.parse(segment.end);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      continue;
    }

    totals[segment.section] += end - start;
  }

  return totals;
}
