import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function MealCardSkeleton() {
  return (
    <Card
      className="gap-0 overflow-hidden border-border bg-[var(--color-card)] py-0 shadow-none"
      data-slot="meal-card-skeleton"
      data-testid="meal-card-skeleton"
    >
      <div className="space-y-4 px-5 py-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-14" />
        </div>
      </div>
    </Card>
  );
}
