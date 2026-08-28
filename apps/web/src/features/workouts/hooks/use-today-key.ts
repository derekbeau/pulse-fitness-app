import { useCallback, useLayoutEffect, useRef } from 'react';

import { useDateAuthority } from '@/hooks/use-date-authority';

export function useTodayKey() {
  const authority = useDateAuthority();
  const mutationDateRef = useRef<string | null>(authority.isLocked ? null : authority.localDate);

  useLayoutEffect(() => {
    mutationDateRef.current = authority.isLocked ? null : authority.localDate;
  }, [authority.isLocked, authority.localDate]);

  const getTodayKeyForMutation = useCallback(() => mutationDateRef.current, []);

  return {
    dateAuthorityLocked: authority.isLocked,
    getTodayKeyForMutation,
    todayKey: authority.localDate,
  };
}
