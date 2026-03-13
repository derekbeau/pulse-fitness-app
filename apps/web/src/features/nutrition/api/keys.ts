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
  daily: (date: string) => [...nutritionKeys.all, 'daily', date] as const,
  summary: (date: string) => [...nutritionKeys.all, 'summary', date] as const,
  weekSummary: (date: string) =>
    [...nutritionKeys.all, 'week-summary', toWeekStartDateKey(date)] as const,
};
