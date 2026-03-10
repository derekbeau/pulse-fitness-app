const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isValidDate = (date: string) => {
  if (!DATE_PATTERN.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
};

const padDatePart = (value: number) => String(value).padStart(2, '0');

export const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = padDatePart(now.getMonth() + 1);
  const day = padDatePart(now.getDate());
  return `${year}-${month}-${day}`;
};

// Interpret YYYY-MM-DD input as UTC midnight to keep calendar-day math timezone-safe.
export const shiftDate = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};
