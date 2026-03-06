import { describe, expect, it, vi } from 'vitest';

import { getToday, parseDateInput, toDateKey } from './date';

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
});
