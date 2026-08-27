export const isSupportedTimeZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.trim().length === 0) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
};

export const resolveUserPreferenceTimeZone = (preferences: unknown): string => {
  if (!preferences || typeof preferences !== 'object') return 'UTC';

  const values = preferences as { timeZone?: unknown; timezone?: unknown };
  const candidate = values.timeZone ?? values.timezone;
  return isSupportedTimeZone(candidate) ? candidate : 'UTC';
};
