export const habitQueryKeys = {
  all: ['habits'] as const,
  entries: (params?: { from: string; to: string }) =>
    params ? (['habits', 'entries', params] as const) : (['habits', 'entries'] as const),
  habit: (id: string) => ['habits', 'habit', id] as const,
  habits: () => ['habits', 'habits'] as const,
  detail: (id: string) => ['habits', 'detail', id] as const,
  entryList: (params?: { from: string; to: string }) =>
    params ? (['habits', 'entries', params] as const) : (['habits', 'entries'] as const),
  list: () => ['habits', 'list'] as const,
};

export const habitKeys = {
  all: habitQueryKeys.all,
  detail: habitQueryKeys.detail,
  entries: habitQueryKeys.entries,
  entryList: habitQueryKeys.entryList,
  habit: habitQueryKeys.habit,
  habits: habitQueryKeys.habits,
  list: habitQueryKeys.list,
};
