import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function MealCardSkeleton() {
  return (
    <Card
      className="gap-0 overflow-hidden rounded-xl border-border/70 bg-[var(--color-card)] py-0 shadow-none"
      data-slot="meal-card-skeleton"
      data-testid="meal-card-skeleton"
    >
      <div className="space-y-3 px-4 py-3 sm:px-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3.5 w-36" />
          </div>
          <Skeleton className="h-3.5 w-24" />
        </div>

        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-1 border-t border-border/60 pt-2 first:border-t-0 first:pt-0">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-48 max-w-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}
