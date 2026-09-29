import { getDateKeyInTimeZone } from './user-time-zone.js';
import { and, eq, gte, inArray, lte, or, type AnyColumn } from 'drizzle-orm';

// Session.date is the persisted scheduling/history date, not necessarily the day it began.
// Old imported rows can have placeholder timestamps; only a real start projects an actual day.
export const workoutActualLocalDate = (
  session: { date: string; startedAt: number | null },
  timeZone: string,
): string =>
  session.startedAt !== null &&
  Number.isFinite(session.startedAt) &&
  session.startedAt >= Date.UTC(2020, 0, 1)
    ? getDateKeyInTimeZone(new Date(session.startedAt), timeZone)
    : session.date;

// An indexed, deliberately broad UTC window; filter owner-local projected dates
// before output limits. One extra day on each side covers timezone/DST offsets.
export const workoutActualDayCandidates = (
  dateColumn: AnyColumn,
  startedColumn: AnyColumn,
  from?: string,
  to?: string,
) => {
  const dates = and(from ? gte(dateColumn, from) : undefined, to ? lte(dateColumn, to) : undefined);
  const starts = and(
    from ? gte(startedColumn, Date.parse(`${from}T00:00:00Z`) - 86_400_000) : undefined,
    to ? lte(startedColumn, Date.parse(`${to}T00:00:00Z`) + 172_800_000) : undefined,
  );
  return from || to ? or(dates, starts) : undefined;
};

// Scheduled sessions have a required startedAt even though they have not begun.
// Cancelled sessions are history, not occurrences. Keep both decisions in SQL
// before the bounded candidate read, then project owner-local dates in memory.
export const workoutOccurrenceDayCandidates = (
  dateColumn: AnyColumn,
  startedColumn: AnyColumn,
  statusColumn: AnyColumn,
  from?: string,
  to?: string,
) =>
  or(
    and(
      eq(statusColumn, 'scheduled'),
      from ? gte(dateColumn, from) : undefined,
      to ? lte(dateColumn, to) : undefined,
    ),
    and(
      inArray(statusColumn, ['in-progress', 'paused', 'completed']),
      workoutActualDayCandidates(dateColumn, startedColumn, from, to),
    ),
  );
