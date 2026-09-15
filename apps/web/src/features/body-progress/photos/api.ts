import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiMetaSchema,
  bodyProgressPhotoPreferenceSchema,
  bodyProgressPhotoSetSchema,
  type BodyProgressPhotoSet,
  type CreateBodyProgressPhotoSet,
  type PatchBodyProgressPhotoPreference,
  type PatchBodyProgressPhotoSet,
  type BodyProgressPhotoView,
} from '@pulse/shared';

import { apiRequest, apiRequestBlob, apiRequestWithMeta } from '@/lib/api-client';
import { bodyProgressQueryKeys } from '../api/keys';

const root = '/api/v1/body-progress';

export interface PhotoDeleteResult {
  id: string;
  deleted: number;
  missing: number;
}

export interface PhotoBulkDeleteResult {
  deletedSets: number;
  deletedPhotos: number;
  deletedFiles: number;
  missingFiles: number;
  backupRetention: string;
}

async function refreshPhotos(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: bodyProgressQueryKeys.photos.all() });
}

export function usePhotoPreferences() {
  return useQuery({
    queryKey: bodyProgressQueryKeys.photos.preferences(),
    queryFn: async () =>
      bodyProgressPhotoPreferenceSchema.parse(await apiRequest(`${root}/photos/preferences`)),
    retry: false,
  });
}

export function useSavePhotoPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PatchBodyProgressPhotoPreference) =>
      bodyProgressPhotoPreferenceSchema.parse(
        await apiRequest(`${root}/photos/preferences`, { method: 'PATCH', body: input }),
      ),
    onSuccess: async (preference) => {
      queryClient.setQueryData(bodyProgressQueryKeys.photos.preferences(), preference);
      await refreshPhotos(queryClient);
    },
  });
}

export function useSkipPhotoOccurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (occurrenceDate: string) =>
      bodyProgressPhotoPreferenceSchema.parse(
        await apiRequest(`${root}/photos/preferences/skip`, {
          method: 'POST',
          body: { occurrenceDate },
        }),
      ),
    onSuccess: async (preference) => {
      queryClient.setQueryData(bodyProgressQueryKeys.photos.preferences(), preference);
      await refreshPhotos(queryClient);
    },
  });
}

export function useSnoozePhotoOccurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (until: string) =>
      bodyProgressPhotoPreferenceSchema.parse(
        await apiRequest(`${root}/photos/preferences/snooze`, { method: 'POST', body: { until } }),
      ),
    onSuccess: async (preference) => {
      queryClient.setQueryData(bodyProgressQueryKeys.photos.preferences(), preference);
      await refreshPhotos(queryClient);
    },
  });
}

export function usePhotoSets(page: number) {
  return useQuery({
    queryKey: bodyProgressQueryKeys.photos.list(page),
    queryFn: async () => {
      const response = await apiRequestWithMeta<unknown, unknown>(
        `${root}/photo-sets/?page=${page}&limit=20`,
      );
      return {
        data: bodyProgressPhotoSetSchema.array().parse(response.data),
        meta: apiMetaSchema.parse(response.meta),
      };
    },
    retry: false,
  });
}

export function usePhotoSet(id: string) {
  return useQuery({
    enabled: Boolean(id),
    queryKey: bodyProgressQueryKeys.photos.detail(id),
    queryFn: async () =>
      bodyProgressPhotoSetSchema.parse(await apiRequest(`${root}/photo-sets/${id}`)),
    retry: false,
  });
}

export function useCreatePhotoSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBodyProgressPhotoSet) =>
      bodyProgressPhotoSetSchema.parse(
        await apiRequest(`${root}/photo-sets/`, { method: 'POST', body: input }),
      ),
    onSuccess: async (set) => {
      queryClient.setQueryData(bodyProgressQueryKeys.photos.detail(set.id), set);
      await refreshPhotos(queryClient);
    },
  });
}

export function useUpdatePhotoSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: PatchBodyProgressPhotoSet }) =>
      bodyProgressPhotoSetSchema.parse(
        await apiRequest(`${root}/photo-sets/${id}`, { method: 'PATCH', body: input }),
      ),
    onSuccess: async (set) => {
      queryClient.setQueryData(bodyProgressQueryKeys.photos.detail(set.id), set);
      await refreshPhotos(queryClient);
    },
  });
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      setId,
      view,
      file,
      signal,
    }: {
      setId: string;
      view: BodyProgressPhotoView;
      file: File;
      signal?: AbortSignal;
    }) => {
      const body = new FormData();
      body.append(view, file, file.name);
      return bodyProgressPhotoSetSchema.parse(
        await apiRequest(`${root}/photo-sets/${setId}/photos`, { method: 'POST', body, signal }),
      );
    },
    onSuccess: async (set) => {
      queryClient.setQueryData(bodyProgressQueryKeys.photos.detail(set.id), set);
      await refreshPhotos(queryClient);
    },
  });
}

export function useDeletePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; setId: string }) =>
      apiRequest<PhotoDeleteResult>(`${root}/photos/${id}`, { method: 'DELETE' }),
    onSuccess: async (_result, input) => {
      queryClient.removeQueries({
        queryKey: bodyProgressQueryKeys.photos.content(input.id, 'thumbnail'),
      });
      queryClient.removeQueries({
        queryKey: bodyProgressQueryKeys.photos.content(input.id, 'comparison'),
      });
      queryClient.removeQueries({
        queryKey: bodyProgressQueryKeys.photos.content(input.id, 'full'),
      });
      await refreshPhotos(queryClient);
    },
  });
}

export function useDeletePhotoSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (set: Pick<BodyProgressPhotoSet, 'id'>) =>
      apiRequest<PhotoDeleteResult>(`${root}/photo-sets/${set.id}`, { method: 'DELETE' }),
    onSuccess: async (_result, set) => {
      queryClient.removeQueries({ queryKey: bodyProgressQueryKeys.photos.detail(set.id) });
      await refreshPhotos(queryClient);
    },
  });
}

export function useDeleteAllPhotos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiRequest<PhotoBulkDeleteResult>(`${root}/photos`, {
        method: 'DELETE',
        body: { confirm: 'delete_all_live_progress_photos' },
      }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: bodyProgressQueryKeys.photos.all() });
      await refreshPhotos(queryClient);
    },
  });
}

export async function fetchPrivatePhoto(
  id: string,
  variant: 'thumbnail' | 'comparison' | 'full',
  signal?: AbortSignal,
) {
  return apiRequestBlob(`${root}/photos/${id}/content?variant=${variant}`, { signal });
}
