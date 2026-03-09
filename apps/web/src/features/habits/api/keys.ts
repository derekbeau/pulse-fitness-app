export const habitKeys = {
  all: ['habits'] as const,
  detail: (id: string) => [...habitKeys.all, 'detail', id] as const,
  entries: (params: { from: string; to: string }) => [...habitKeys.all, 'entries', params] as const,
  list: () => [...habitKeys.all, 'list'] as const,
};
