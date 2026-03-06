import { describe, expect, it } from 'vitest';

import {
  addDays,
  differenceInDays,
  parseDateKey,
  startOfWeek,
  toDateKey,
} from '@/lib/date-utils';

describe('date-utils', () => {
  it('parses and formats date keys consistently', () => {
    const date = parseDateKey('2026-03-09');

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(9);
    expect(date.getHours()).toBe(12);
    expect(toDateKey(date)).toBe('2026-03-09');
  });

  it('returns the Monday for any date in the same week', () => {
    expect(toDateKey(startOfWeek(new Date(2026, 2, 8, 9)))).toBe('2026-03-02');
    expect(toDateKey(startOfWeek(new Date(2026, 2, 9, 18)))).toBe('2026-03-09');
  });

  it('counts calendar days correctly across DST changes', () => {
    const start = new Date(2026, 2, 7, 12);
    const end = addDays(start, 2);

    expect(differenceInDays(start, end)).toBe(2);
  });
});
