import { chartDateKeyInTimeZone } from '@pulse/shared';

const SEARCH_WINDOW_MS = 36 * 60 * 60 * 1000;

export const nextProgramLocalDateBoundaryMs = (nowMs: number, timeZone: string) => {
  const currentDateKey = chartDateKeyInTimeZone(nowMs, timeZone);
  let lower = Math.floor(nowMs) + 1;
  let upper = lower + SEARCH_WINDOW_MS;
  if (chartDateKeyInTimeZone(upper, timeZone) === currentDateKey) {
    throw new RangeError('Unable to find the next program-local date boundary');
  }

  while (lower < upper) {
    const midpoint = lower + Math.floor((upper - lower) / 2);
    if (chartDateKeyInTimeZone(midpoint, timeZone) === currentDateKey) {
      lower = midpoint + 1;
    } else {
      upper = midpoint;
    }
  }
  return lower;
};
