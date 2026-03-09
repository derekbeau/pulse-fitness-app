import { getUtcDateValue } from '@pulse/shared';

export { getUtcDateValue };

export const addUtcDays = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

export const getDatesInRange = (from: string, to: string) => {
  const dates: string[] = [];

  let current = from;
  while (current <= to) {
    dates.push(current);
    current = addUtcDays(current, 1);
  }

  return dates;
};
