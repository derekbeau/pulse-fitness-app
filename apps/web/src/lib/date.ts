const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const normalizeDate = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

export const toDateKey = (date: Date): string => formatDateKey(normalizeDate(date));

export const getToday = (): Date => normalizeDate(new Date());

export const isSameDay = (first: Date, second: Date): boolean => {
  return formatDateKey(first) === formatDateKey(second);
};

export const getWeekStart = (date: Date): Date => {
  const normalizedDate = normalizeDate(date);
  const dayOfWeek = normalizedDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(normalizedDate, mondayOffset);
};

export const parseDateInput = (value: string): Date => {
  return DATE_ONLY_PATTERN.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
};
