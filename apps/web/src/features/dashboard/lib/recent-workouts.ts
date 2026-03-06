import { getToday, normalizeDate, parseDateInput } from '@/lib/date';

const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const formatRelativeWorkoutDate = (value: string, today: Date = getToday()): string => {
  const workoutDate = normalizeDate(parseDateInput(value));
  const currentDate = normalizeDate(today);
  const diffInDays = Math.max(
    0,
    Math.round((currentDate.getTime() - workoutDate.getTime()) / MS_PER_DAY),
  );

  if (diffInDays === 0) {
    return 'Today';
  }

  if (diffInDays === 1) {
    return 'Yesterday';
  }

  if (diffInDays < DAYS_PER_WEEK) {
    return `${diffInDays} days ago`;
  }

  const weeks = Math.round(diffInDays / DAYS_PER_WEEK);

  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
};
