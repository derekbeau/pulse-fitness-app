import { useEffect } from 'react';

import { useAdaptiveNutritionState } from '@/features/adaptive-nutrition';
import { nextProgramLocalDateBoundaryMs } from '@/features/nutrition/lib/program-local-midnight';

export function useDateAuthority() {
  const query = useAdaptiveNutritionState();
  const refetch = query.refetch;
  const localDate = query.data?.localDate ?? null;
  const timeZone = query.data?.timeZone ?? query.data?.program?.timeZone ?? null;
  const isStale = Boolean(query.data) && query.isRefetchError;

  useEffect(() => {
    const refresh = () => void refetch();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refetch]);

  useEffect(() => {
    if (!localDate || !timeZone) return;
    const nowMs = Date.now();
    const boundaryMs = nextProgramLocalDateBoundaryMs(nowMs, timeZone);
    const timer = window.setTimeout(() => void refetch(), Math.max(0, boundaryMs - nowMs));
    return () => window.clearTimeout(timer);
  }, [localDate, refetch, timeZone]);

  return {
    isInitialError: !query.data && query.isError,
    isLoading: !query.data && query.isPending,
    isLocked: !localDate || isStale,
    isRetrying: query.isFetching,
    isStale,
    localDate,
    query,
    retry: refetch,
    timeZone,
  };
}
