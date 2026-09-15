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
  photos: {
    all: () => ['body-progress', 'photos'] as const,
    preferences: () => ['body-progress', 'photos', 'preferences'] as const,
    list: (page: number) => ['body-progress', 'photos', 'list', page] as const,
    detail: (id: string) => ['body-progress', 'photos', 'detail', id] as const,
    content: (id: string, variant: string) =>
      ['body-progress', 'photos', 'content', id, variant] as const,
  },
};
