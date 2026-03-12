import { ArrowDown, Loader2 } from 'lucide-react';

import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { cn } from '@/lib/utils';

type PullToRefreshProps = {
  onRefresh: () => Promise<unknown> | unknown;
  threshold?: number;
};

export function PullToRefresh({ onRefresh, threshold = 80 }: PullToRefreshProps) {
  const { isStandalone, pulling, pullDistance, refreshing } = usePullToRefresh({
    onRefresh,
    threshold,
  });

  if (!isStandalone) {
    return null;
  }

  const progress = Math.min(pullDistance / threshold, 1);
  const offsetY = refreshing ? 0 : -64 + progress * 64;
  const indicatorText = refreshing
    ? 'Refreshing...'
    : progress >= 1
      ? 'Release to refresh'
      : 'Pull to refresh';

  return (
    <div
      aria-hidden={!refreshing && !pulling}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{ transform: `translateY(${offsetY}px)`, transition: refreshing ? 'transform 180ms ease-out' : 'none' }}
    >
      <div className="mt-2 flex min-w-44 items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
        {refreshing ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin text-primary" />
        ) : (
          <ArrowDown
            aria-hidden="true"
            className={cn('size-4 text-muted-foreground transition-transform duration-100')}
            style={{ transform: `rotate(${Math.round(progress * 180)}deg)` }}
          />
        )}
        <span>{indicatorText}</span>
      </div>
    </div>
  );
}
