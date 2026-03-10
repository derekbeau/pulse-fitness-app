import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type StatCardSkeletonProps = {
  className?: string;
  showTrend?: boolean;
};

export function StatCardSkeleton({ className, showTrend = true }: StatCardSkeletonProps) {
  return (
    <Card
      className={cn('gap-3 py-4 sm:gap-4 sm:py-5', className)}
      data-testid="stat-card-skeleton"
      data-slot="stat-card-skeleton"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-0">
        <Skeleton className="h-4 w-24 sm:h-5 sm:w-28" />
        <Skeleton className="size-5 rounded-full" />
      </CardHeader>
      <CardContent className="space-y-1.5">
        <Skeleton className="h-7 w-28 sm:h-8 sm:w-36 lg:h-9" />
        {showTrend ? <Skeleton className="h-4 w-16" /> : null}
      </CardContent>
    </Card>
  );
}
