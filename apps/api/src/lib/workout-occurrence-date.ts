import { getDateKeyInTimeZone } from './user-time-zone.js';

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
