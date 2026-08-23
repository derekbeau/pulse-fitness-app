import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adaptiveReviewContextSchema,
  dataQualityCalendarSchema,
  type AdaptiveReviewContextCreateInput,
  type DataQualityCalendarQuery,
} from '@pulse/shared';
import { toast } from 'sonner';

import { apiRequest } from '@/lib/api-client';

export const dataQualityQueryKeys = {
  all: ['data-quality'] as const,
  calendar: (query: DataQualityCalendarQuery) =>
    [
      ...dataQualityQueryKeys.all,
      'calendar',
      { start: query.start ?? null, end: query.end ?? null, timeZone: query.timeZone ?? null },
    ] as const,
};

const fetchDataQualityCalendar = (query: DataQualityCalendarQuery, signal?: AbortSignal) => {
  const params = new URLSearchParams();
  if (query.start) params.set('start', query.start);
  if (query.end) params.set('end', query.end);
  if (query.timeZone) params.set('timeZone', query.timeZone);
  return apiRequest<unknown>(`/api/v1/data-quality/calendar?${params.toString()}`, {
    signal,
  }).then((value) => dataQualityCalendarSchema.parse(value));
};

export const useDataQualityCalendar = (query: DataQualityCalendarQuery) =>
  useQuery({
    queryKey: dataQualityQueryKeys.calendar(query),
    queryFn: ({ signal }) => fetchDataQualityCalendar(query, signal),
    placeholderData: keepPreviousData,
  });

const createDateContext = (input: AdaptiveReviewContextCreateInput) =>
  apiRequest<unknown>('/api/v1/adaptive-nutrition/review-context', {
    method: 'POST',
    body: input,
  }).then((value) => adaptiveReviewContextSchema.parse(value));

export const useCreateDataQualityContext = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDateContext,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dataQualityQueryKeys.all });
      toast.success('Context added without changing algorithm eligibility');
    },
  });
};
