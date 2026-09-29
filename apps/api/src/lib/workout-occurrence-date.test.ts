import { describe, expect, it } from 'vitest';
import { workoutActualLocalDate } from './workout-occurrence-date.js';

describe('workout actual local day projection', () => {
  it('retains original date while projecting starts on either side of midnight and DST', () => {
    const scheduled = { date: '2026-03-08', startedAt: Date.parse('2026-03-10T03:30:00Z') };
    expect(workoutActualLocalDate(scheduled, 'America/Detroit')).toBe('2026-03-09');
    expect(workoutActualLocalDate(scheduled, 'Asia/Tokyo')).toBe('2026-03-10');
    expect(scheduled.date).toBe('2026-03-08');
    expect(
      workoutActualLocalDate(
        { date: '2026-11-01', startedAt: Date.parse('2026-11-01T05:30:00Z') },
        'America/Detroit',
      ),
    ).toBe('2026-11-01');
    expect(
      workoutActualLocalDate(
        { date: '2026-11-01', startedAt: Date.parse('2026-11-02T04:30:00Z') },
        'America/Detroit',
      ),
    ).toBe('2026-11-01');
  });
  it('does not manufacture a day from legacy placeholder timestamps', () => {
    expect(workoutActualLocalDate({ date: '2026-03-09', startedAt: 1000 }, 'America/Detroit')).toBe(
      '2026-03-09',
    );
  });
});
