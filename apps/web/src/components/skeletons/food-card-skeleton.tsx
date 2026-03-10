import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function FoodCardSkeleton() {
  return (
    <Card
      className="gap-4 border-border bg-card py-5 shadow-none"
      data-slot="food-card-skeleton"
      data-testid="food-card-skeleton"
    >
      <CardHeader className="gap-3 px-5 sm:px-6">
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
      </CardHeader>
      <CardContent className="px-5 sm:px-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-lg border border-border/70 bg-background/70" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
