import { useQuery } from '@tanstack/react-query';
import { calendarRuntimeSchema, type CalendarRuntime } from '@pulse/shared';
import { ApiError, apiRequest } from '@/lib/api-client';

export type CalendarQuery = {
  from: string;
  to: string;
  domain: CalendarRuntime['filters']['domain'];
  state: CalendarRuntime['filters']['state'];
};
export const calendarQueryKey = (query: CalendarQuery) => ['calendar', query] as const;
export const fetchCalendar = (query: CalendarQuery, signal?: AbortSignal) => {
  const params = new URLSearchParams({ from: query.from, to: query.to });
  for (const domain of query.domain) params.append('domain', domain);
  for (const state of query.state) params.append('state', state);
  return apiRequest<unknown>(`/api/v1/calendar?${params}`, { signal }).then((value) =>
    calendarRuntimeSchema.parse(value),
  );
};
export const useCalendar = (query: CalendarQuery) =>
  useQuery({
    queryKey: calendarQueryKey(query),
    queryFn: ({ signal }) => fetchCalendar(query, signal),
    retry: (attempt, error) =>
      !(error instanceof ApiError && [400, 401, 422].includes(error.status)) && attempt < 2,
  });
