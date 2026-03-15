import { formatDateKey, getWeekStart, parseDateInput } from '@/lib/date';

const toWeekStartDateKey = (date: string): string => {
  const parsedDate = parseDateInput(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return formatDateKey(getWeekStart(parsedDate));
};

export const nutritionQueryKeys = {
  all: ['nutrition'] as const,
  day: (date: string) => ['nutrition', 'day', date] as const,
  summary: (date: string) => ['nutrition', 'summary', date] as const,
  weekSummary: (date: string) => ['nutrition', 'week-summary', toWeekStartDateKey(date)] as const,
};

export const nutritionKeys = {
  all: nutritionQueryKeys.all,
  daily: nutritionQueryKeys.day,
  summary: nutritionQueryKeys.summary,
  weekSummary: nutritionQueryKeys.weekSummary,
};
