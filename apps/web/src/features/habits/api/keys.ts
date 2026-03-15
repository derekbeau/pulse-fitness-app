export const habitQueryKeys = {
  all: ['habits'] as const,
  entries: (params?: { from: string; to: string }) =>
    params ? (['habits', 'entries', params] as const) : (['habits', 'entries'] as const),
  habit: (id: string) => ['habits', 'habit', id] as const,
  habits: () => ['habits', 'habits'] as const,
};

export const habitKeys = {
  all: habitQueryKeys.all,
  detail: habitQueryKeys.habit,
  entries: habitQueryKeys.entries,
  list: habitQueryKeys.habits,
};
