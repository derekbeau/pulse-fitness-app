import { afterEach, describe, expect, it, vi } from 'vitest';

import { dashboardTodayDateKey, scheduleDashboardDateRollover } from './program-date';

afterEach(() => {
  vi.useRealTimers();
});

describe('dashboard program date authority', () => {
  it('uses the program calendar instead of the caller browser day', () => {
    const instant = new Date('2026-08-24T03:30:00.000Z');

    expect(dashboardTodayDateKey(instant, 'America/Detroit')).toBe('2026-08-23');
    expect(dashboardTodayDateKey(instant, 'Pacific/Kiritimati')).toBe('2026-08-24');
  });

  it('rolls a continuously visible dashboard at Detroit midnight before spring DST', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T04:59:50.000Z'));
    const onRollover = vi.fn();

    const cancel = scheduleDashboardDateRollover('America/Detroit', onRollover);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(onRollover).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onRollover).toHaveBeenCalledOnce();
    expect(dashboardTodayDateKey(Date.now(), 'America/Detroit')).toBe('2026-03-08');
    cancel();
  });
});
