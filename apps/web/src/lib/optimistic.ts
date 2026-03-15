import {
  useMutation,
  useQueryClient,
  type MutationFunction,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';

type QueryKeyResolverParams<TData, TVariables, TMeta> = {
  data?: TData;
  error?: Error | null;
  meta: TMeta;
  variables: TVariables;
};

type QueryKeyResolver<TData, TVariables, TMeta> =
  | QueryKey
  | readonly QueryKey[]
  | ((params: QueryKeyResolverParams<TData, TVariables, TMeta>) => QueryKey | readonly QueryKey[]);

type OptimisticUpdaterContext<TMeta> = {
  meta: TMeta;
  queryKey: QueryKey;
};

type SnapshotEntry<TCache> = readonly [QueryKey, TCache | undefined];

type OptimisticMutationContext<TCache, TMeta> = {
  meta: TMeta;
  snapshots: SnapshotEntry<TCache>[];
};

type CreateOptimisticMutationOptions<TCache, TData, TVariables, TMeta> = {
  mutationFn: MutationFunction<TData, TVariables>;
  queryKey: QueryKeyResolver<TData, TVariables, TMeta>;
  updater: (
    current: TCache | undefined,
    variables: TVariables,
    context: OptimisticUpdaterContext<TMeta>,
  ) => TCache | undefined;
  invalidateKeys?: QueryKeyResolver<TData, TVariables, TMeta>;
  getMeta?: (variables: TVariables, queryClient: QueryClient) => TMeta;
  reconcile?: (
    current: TCache | undefined,
    data: TData,
    variables: TVariables,
    context: OptimisticUpdaterContext<TMeta>,
  ) => TCache | undefined;
  onError?: (
    error: Error,
    variables: TVariables,
    context: OptimisticMutationContext<TCache, TMeta> | undefined,
    queryClient: QueryClient,
  ) => Promise<void> | void;
  onMutate?: (
    variables: TVariables,
    context: OptimisticMutationContext<TCache, TMeta>,
    queryClient: QueryClient,
  ) => Promise<void> | void;
  onSettled?: (
    data: TData | undefined,
    error: Error | null,
    variables: TVariables,
    context: OptimisticMutationContext<TCache, TMeta> | undefined,
    queryClient: QueryClient,
  ) => Promise<void> | void;
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: OptimisticMutationContext<TCache, TMeta> | undefined,
    queryClient: QueryClient,
  ) => Promise<void> | void;
};

const EMPTY_QUERY_KEYS: readonly QueryKey[] = [];

function dedupeQueryKeys(queryKeys: readonly QueryKey[]) {
  const seen = new Set<string>();
  const uniqueKeys: QueryKey[] = [];

  queryKeys.forEach((queryKey) => {
    const keyId = JSON.stringify(queryKey);
    if (seen.has(keyId)) {
      return;
    }

    seen.add(keyId);
    uniqueKeys.push(queryKey);
  });

  return uniqueKeys;
}

function resolveQueryKeys<TData, TVariables, TMeta>(
  queryKey: QueryKeyResolver<TData, TVariables, TMeta> | undefined,
  params: QueryKeyResolverParams<TData, TVariables, TMeta>,
) {
  if (!queryKey) {
    return EMPTY_QUERY_KEYS;
  }

  const resolvedQueryKey = typeof queryKey === 'function' ? queryKey(params) : queryKey;
  if (Array.isArray(resolvedQueryKey) && resolvedQueryKey.length === 0) {
    return EMPTY_QUERY_KEYS;
  }
  const queryKeys =
    Array.isArray(resolvedQueryKey) && Array.isArray(resolvedQueryKey[0])
      ? (resolvedQueryKey as readonly QueryKey[])
      : [resolvedQueryKey as QueryKey];

  return dedupeQueryKeys(queryKeys);
}

function snapshotQueries<TCache>(queryClient: QueryClient, queryKeys: readonly QueryKey[]) {
  const snapshots = new Map<string, SnapshotEntry<TCache>>();

  queryKeys.forEach((queryKey) => {
    queryClient.getQueriesData<TCache>({ queryKey }).forEach(([matchedQueryKey, data]) => {
      const keyId = JSON.stringify(matchedQueryKey);
      if (!snapshots.has(keyId)) {
        snapshots.set(keyId, [matchedQueryKey, data]);
      }
    });
  });

  return [...snapshots.values()];
}

async function invalidateQueryKeys(queryClient: QueryClient, queryKeys: readonly QueryKey[]) {
  await Promise.all(
    queryKeys.map((queryKey) =>
      queryClient.invalidateQueries({
        queryKey,
      }),
    ),
  );
}

function useOptimisticMutation<
  TCache,
  TData,
  TVariables,
  TMeta = undefined,
>({
  mutationFn,
  queryKey,
  updater,
  invalidateKeys,
  getMeta,
  reconcile,
  onError,
  onMutate,
  onSettled,
  onSuccess,
}: CreateOptimisticMutationOptions<TCache, TData, TVariables, TMeta>) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables, OptimisticMutationContext<TCache, TMeta>>({
    mutationFn,
    onMutate: async (variables) => {
      const meta = getMeta
        ? getMeta(variables, queryClient)
        : (undefined as unknown as TMeta);
      const resolvedQueryKeys = resolveQueryKeys(queryKey, { meta, variables });

      await Promise.all(
        resolvedQueryKeys.map((resolvedQueryKey) =>
          queryClient.cancelQueries({
            queryKey: resolvedQueryKey,
          }),
        ),
      );

      const snapshots = snapshotQueries<TCache>(queryClient, resolvedQueryKeys);
      const context = {
        meta,
        snapshots,
      };

      snapshots.forEach(([snapshotQueryKey]) => {
        queryClient.setQueryData<TCache>(snapshotQueryKey, (current) =>
          updater(current, variables, {
            meta,
            queryKey: snapshotQueryKey,
          }),
        );
      });

      await onMutate?.(variables, context, queryClient);

      return context;
    },
    onError: async (error, variables, context) => {
      context?.snapshots.forEach(([snapshotQueryKey, snapshotData]) => {
        queryClient.setQueryData(snapshotQueryKey, snapshotData);
      });

      await onError?.(error, variables, context, queryClient);
    },
    onSuccess: async (data, variables, context) => {
      if (reconcile && context) {
        context.snapshots.forEach(([snapshotQueryKey]) => {
          queryClient.setQueryData<TCache>(snapshotQueryKey, (current) =>
            reconcile(current, data, variables, {
              meta: context.meta,
              queryKey: snapshotQueryKey,
            }),
          );
        });
      }

      await onSuccess?.(data, variables, context, queryClient);
    },
    onSettled: async (data, error, variables, context) => {
      const meta = context?.meta ?? (undefined as unknown as TMeta);
      const resolvedInvalidateKeys = resolveQueryKeys(invalidateKeys, {
        data,
        error,
        meta,
        variables,
      });

      await invalidateQueryKeys(queryClient, resolvedInvalidateKeys);
      await onSettled?.(data, error, variables, context, queryClient);
    },
  });
}

export const createOptimisticMutation = useOptimisticMutation;
export type { OptimisticMutationContext };
