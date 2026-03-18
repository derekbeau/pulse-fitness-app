export const DASHBOARD_SNAPSHOT_POLL_INTERVAL_MS = 20_000;
export const NUTRITION_POLL_INTERVAL_MS = 20_000;
export const NUTRITION_WEEK_SUMMARY_POLL_INTERVAL_MS = 30_000;
export const HABIT_ENTRIES_POLL_INTERVAL_MS = 30_000;
export const WEIGHT_TREND_POLL_INTERVAL_MS = 30_000;

const isVitestRuntime = import.meta.env.MODE === 'test';

export const getForegroundPollingInterval = (intervalMs: number): number | undefined => {
  if (isVitestRuntime) {
    return undefined;
  }

  return intervalMs;
};
