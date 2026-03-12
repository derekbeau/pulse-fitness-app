import { useEffect, useState } from 'react';

import { toDateKey } from '@/lib/date-utils';

const DAY_MS = 24 * 60 * 60 * 1000;

function msUntilNextLocalMidnight(now: Date) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(next.getTime() - now.getTime(), 0);
}

export function useTodayKey() {
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));

  useEffect(() => {
    const syncToday = () => setTodayKey(toDateKey(new Date()));
    let cleanup = () => {};

    syncToday();
    const initialTimeout = window.setTimeout(() => {
      syncToday();
      const intervalId = window.setInterval(syncToday, DAY_MS);
      cleanup = () => window.clearInterval(intervalId);
    }, msUntilNextLocalMidnight(new Date()));

    return () => {
      window.clearTimeout(initialTimeout);
      cleanup();
    };
  }, []);

  return todayKey;
}
