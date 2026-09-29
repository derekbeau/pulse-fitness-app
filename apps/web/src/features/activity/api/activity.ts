import { useQuery } from '@tanstack/react-query';
import { activityDetailSchema, activityListItemSchema, type ActivityDetail } from '@pulse/shared';
import { z } from 'zod';
import { apiRequest, apiRequestWithMeta, ApiError } from '@/lib/api-client';

const listSchema = z
  .object({
    data: z.array(activityListItemSchema),
    meta: z.object({ page: z.number(), limit: z.number(), total: z.number() }).strict(),
  })
  .strict();
export type ActivityList = z.infer<typeof listSchema>;

export const fetchActivities = async (page = 1, signal?: AbortSignal): Promise<ActivityList> => {
  const response = await apiRequestWithMeta<unknown, unknown>(
    `/api/v1/activities?page=${page}&limit=100`,
    { signal },
  );
  return listSchema.parse(response);
};
export const fetchActivity = async (id: string, signal?: AbortSignal): Promise<ActivityDetail> =>
  activityDetailSchema.parse(
    await apiRequest<unknown>(`/api/v1/activities/${encodeURIComponent(id)}`, { signal }),
  );
const retry = (attempt: number, error: Error) =>
  !(error instanceof ApiError && [400, 401, 404, 422].includes(error.status)) && attempt < 2;
export const useActivities = (page = 1) =>
  useQuery({
    queryKey: ['activities', page],
    queryFn: ({ signal }) => fetchActivities(page, signal),
    retry,
  });
export const useActivity = (id: string) =>
  useQuery({
    queryKey: ['activity', id],
    queryFn: ({ signal }) => fetchActivity(id, signal),
    enabled: Boolean(id),
    retry,
  });
