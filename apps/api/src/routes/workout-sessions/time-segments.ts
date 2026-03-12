import type { WorkoutSessionTimeSegment } from '@pulse/shared';

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

export function openTimeSegment(
  timeSegments: WorkoutSessionTimeSegment[],
  startIso: string,
): WorkoutSessionTimeSegment[] {
  return [...timeSegments, { start: startIso, end: null }];
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
