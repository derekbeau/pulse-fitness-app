import { describe, expect, it, vi } from 'vitest';

import {
  formatUtcDateKey,
  getToday,
  getWeekStart,
  isSameDay,
  parseDateInput,
  toDateKey,
} from './date';

describe('date utilities', () => {
  it('parses date-only strings at local midnight', () => {
    const parsedDate = parseDateInput('2026-03-04');

    expect(parsedDate.getHours()).toBe(0);
    expect(parsedDate.getMinutes()).toBe(0);
    expect(toDateKey(parsedDate)).toBe('2026-03-04');
  });

  it('normalizes getToday to the current local date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T21:43:00'));

    expect(toDateKey(getToday())).toBe('2026-03-06');

    vi.useRealTimers();
  });

  it('compares dates by local calendar day', () => {
    expect(isSameDay(new Date('2026-03-06T00:15:00'), new Date('2026-03-06T23:45:00'))).toBe(true);
    expect(isSameDay(new Date('2026-03-06T23:59:00'), new Date('2026-03-07T00:00:00'))).toBe(false);
  });

  it('returns Monday as the start of the week', () => {
    expect(toDateKey(getWeekStart(new Date('2026-03-06T09:15:00')))).toBe('2026-03-02');
    expect(toDateKey(getWeekStart(new Date('2026-03-08T09:15:00')))).toBe('2026-03-02');
  });

  it('formats UTC calendar dates for API date-only fields', () => {
    expect(formatUtcDateKey(new Date('2026-03-09T01:30:00-05:00'))).toBe('2026-03-09');
  });
});
