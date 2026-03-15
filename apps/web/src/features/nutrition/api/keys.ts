import { formatDateKey, getWeekStart, parseDateInput } from '@/lib/date';

const toWeekStartDateKey = (date: string): string => {
  const parsedDate = parseDateInput(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return formatDateKey(getWeekStart(parsedDate));
};

export const nutritionKeys = {
  all: ['nutrition'] as const,
  day: (date: string) => ['nutrition', 'day', date] as const,
  daily: (date: string) => ['nutrition', 'day', date] as const,
  summary: (date: string) => ['nutrition', 'summary', date] as const,
  weekSummary: (date: string) => ['nutrition', 'week-summary', toWeekStartDateKey(date)] as const,
};

export const nutritionQueryKeys = nutritionKeys;
