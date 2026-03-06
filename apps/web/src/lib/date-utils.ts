const MS_PER_DAY = 86_400_000;

export function getMondayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeek(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);

  return addDays(normalized, -getMondayIndex(normalized));
}

export function differenceInDays(start: Date, end: Date) {
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());

  return (utcEnd - utcStart) / MS_PER_DAY;
}

export const differenceInCalendarDays = differenceInDays;

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}
