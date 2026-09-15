export const bodyProgressQueryKeys = {
  all: ['body-progress'] as const,
  analyticsRoot: () => ['body-progress', 'analytics'] as const,
  analytics: (range: string, end: string | undefined) =>
    ['body-progress', 'analytics', { range, end: end ?? null }] as const,
  preferences: () => ['body-progress', 'preferences'] as const,
  due: () => ['body-progress', 'due'] as const,
  list: () => ['body-progress', 'list'] as const,
  legacy: () => ['body-progress', 'legacy'] as const,
  detail: (id: string) => ['body-progress', 'detail', id] as const,
  history: (id: string) => ['body-progress', 'history', id] as const,
  context: () => ['body-progress', 'context'] as const,
};
