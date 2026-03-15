import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function HabitRowSkeleton() {
  return (
    <Card
      className="gap-3 border-transparent py-4 shadow-sm"
      data-slot="habit-row-skeleton"
      data-testid="habit-row-skeleton"
    >
      <CardHeader className="space-y-2.5 pb-0">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2.5 shadow-sm dark:bg-secondary/60 dark:shadow-none">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="size-5 rounded-sm" />
        </div>
      </CardContent>
    </Card>
  );
}
