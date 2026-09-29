import { useQuery } from '@tanstack/react-query';
import { sessionContextRuntimeSchema } from '@pulse/shared';
import { apiRequest, ApiError } from '@/lib/api-client';

export const fetchSessionContext = async (id: string, signal?: AbortSignal) =>
  sessionContextRuntimeSchema.parse(
    await apiRequest<unknown>(
      `/api/v1/workout-sessions/${encodeURIComponent(id)}/session-context`,
      { signal },
    ),
  );
export const useSessionContext = (id: string) =>
  useQuery({
    queryKey: ['session-context', id],
    queryFn: ({ signal }) => fetchSessionContext(id, signal),
    enabled: Boolean(id),
    retry: (attempt, error) =>
      !(error instanceof ApiError && [400, 401, 404, 422].includes(error.status)) && attempt < 2,
  });
