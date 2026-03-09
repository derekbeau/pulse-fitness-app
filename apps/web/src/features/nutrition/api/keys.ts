export const nutritionKeys = {
  all: ['nutrition'] as const,
  daily: (date: string) => [...nutritionKeys.all, 'daily', date] as const,
  summary: (date: string) => [...nutritionKeys.all, 'summary', date] as const,
};
