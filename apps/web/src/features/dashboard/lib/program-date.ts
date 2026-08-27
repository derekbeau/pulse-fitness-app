import { chartDateKeyInTimeZone } from '@pulse/shared';

import { nextProgramLocalDateBoundaryMs } from '@/features/nutrition/lib/program-local-midnight';

export function dashboardTodayDateKey(instant: Date | number, timeZone: string) {
  return chartDateKeyInTimeZone(instant, timeZone);
}

export function scheduleDashboardDateRollover(
  timeZone: string,
  onRollover: () => void,
  now: () => number = Date.now,
) {
  const currentTimeMs = now();
  const boundaryMs = nextProgramLocalDateBoundaryMs(currentTimeMs, timeZone);
  const timer = window.setTimeout(onRollover, Math.max(0, boundaryMs - currentTimeMs));
  return () => window.clearTimeout(timer);
}
