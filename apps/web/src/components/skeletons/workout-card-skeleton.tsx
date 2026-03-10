import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function WorkoutCardSkeleton() {
  return (
    <Card
      className="gap-4 border-border py-0 shadow-sm"
      data-slot="workout-card-skeleton"
      data-testid="workout-card-skeleton"
    >
      <CardHeader className="space-y-3 py-5">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </CardHeader>
      <CardContent className="pb-5">
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}
