import { useCallback, useEffect, useRef, useState } from 'react';

type RefreshCallback = () => Promise<unknown> | unknown;

type PullToRefreshState = {
  isStandalone: boolean;
  pulling: boolean;
  pullDistance: number;
  refreshing: boolean;
};

type UsePullToRefreshOptions = {
  onRefresh: RefreshCallback;
  threshold?: number;
  maxPullDistance?: number;
};

const DISPLAY_MODE_STANDALONE_QUERY = '(display-mode: standalone)';
export const DEFAULT_THRESHOLD = 80;
const DEFAULT_MAX_PULL_DISTANCE = 140;

const hasWindow = () => typeof window !== 'undefined';

const isStandalonePwa = (): boolean => {
  if (!hasWindow()) {
    return false;
  }

  const mediaMatches =
    typeof window.matchMedia === 'function' && window.matchMedia(DISPLAY_MODE_STANDALONE_QUERY).matches;
  const iOSStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  return mediaMatches || iOSStandalone;
};

const isAtTop = (): boolean => {
  if (!hasWindow()) {
    return false;
  }

  return window.scrollY <= 0;
};

export function usePullToRefresh({
  onRefresh,
  threshold = DEFAULT_THRESHOLD,
  maxPullDistance = DEFAULT_MAX_PULL_DISTANCE,
}: UsePullToRefreshOptions): PullToRefreshState {
  const [isStandalone, setIsStandalone] = useState<boolean>(() => isStandalonePwa());
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const touchStartYRef = useRef(0);
  const isTouchActiveRef = useRef(false);
  const canPullRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const hapticFiredRef = useRef(false);

  const updatePullDistance = useCallback((nextDistance: number) => {
    pullDistanceRef.current = nextDistance;
    setPullDistance(nextDistance);
  }, []);

  useEffect(() => {
    if (!hasWindow() || typeof window.matchMedia !== 'function') {
      setIsStandalone(Boolean((globalThis.navigator as Navigator & { standalone?: boolean }).standalone));
      return;
    }

    const mediaQueryList = window.matchMedia(DISPLAY_MODE_STANDALONE_QUERY);
    const syncStandaloneState = () => {
      setIsStandalone(mediaQueryList.matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    };

    syncStandaloneState();

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', syncStandaloneState);
      return () => {
        mediaQueryList.removeEventListener('change', syncStandaloneState);
      };
    }

    mediaQueryList.addListener(syncStandaloneState);
    return () => {
      mediaQueryList.removeListener(syncStandaloneState);
    };
  }, []);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    if (!hasWindow() || !isStandalone) {
      return;
    }

    const resetPullState = () => {
      isTouchActiveRef.current = false;
      canPullRef.current = false;
      hapticFiredRef.current = false;
      setPulling(false);
      updatePullDistance(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) {
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      isTouchActiveRef.current = true;
      canPullRef.current = isAtTop();
      hapticFiredRef.current = false;
      touchStartYRef.current = touch.clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!isTouchActiveRef.current || refreshingRef.current) {
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      const deltaY = touch.clientY - touchStartYRef.current;

      if (!canPullRef.current || deltaY <= 0 || !isAtTop()) {
        setPulling(false);
        updatePullDistance(0);
        return;
      }

      const nextDistance = Math.min(deltaY, maxPullDistance);
      setPulling(true);
      updatePullDistance(nextDistance);

      if (nextDistance >= threshold && !hapticFiredRef.current) {
        hapticFiredRef.current = true;
        window.navigator.vibrate?.(10);
      }

      event.preventDefault();
    };

    const onTouchEnd = async () => {
      if (!isTouchActiveRef.current) {
        return;
      }

      const shouldRefresh = pullDistanceRef.current >= threshold;
      resetPullState();

      if (!shouldRefresh || refreshingRef.current) {
        return;
      }

      refreshingRef.current = true;
      setRefreshing(true);
      try {
        await onRefresh();
      } catch (error) {
        console.error('Pull-to-refresh failed:', error);
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isStandalone, maxPullDistance, onRefresh, threshold, updatePullDistance]);

  return {
    isStandalone,
    pulling,
    pullDistance,
    refreshing,
  };
}
