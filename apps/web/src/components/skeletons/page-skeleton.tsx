import { Skeleton } from '@/components/ui/skeleton';

export function PageSkeleton() {
  return (
    <main
      aria-label="Loading page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6"
    >
      <Skeleton className="h-9 w-44" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-56 w-full rounded-2xl" />
    </main>
  );
}
