import { ChevronRight, ClipboardList } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { useAdaptiveWeeklyReviewHistory } from '../api/adaptive-nutrition';
import { formatAdaptiveDate } from '../lib/format-adaptive-nutrition';

const stateCopy = {
  pending: 'Pending',
  awaiting_clarification: 'Awaiting clarification',
  deferred: 'Deferred',
  accepted: 'Accepted',
  declined: 'Declined',
  superseded: 'Superseded',
  stale: 'Needs refresh',
} as const;

export function WeeklyReviewHistory() {
  const query = useAdaptiveWeeklyReviewHistory(1, 6);
  if (query.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (query.isError || !query.data?.data.length) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-primary">
          <ClipboardList aria-hidden="true" className="size-4" />
          <CardTitle>
            <h2>Weekly decision history</h2>
          </CardTitle>
        </div>
        <CardDescription>
          Original evidence, proposal edits, deferrals, questions, and your final decision remain
          auditable.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/60">
          {query.data.data.map((review) => {
            const recommendation = review.snapshot.modules.find(
              (module) => module.kind === 'recommendation',
            );
            return (
              <li key={review.id}>
                <Link
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  to={`/nutrition/reviews/${review.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {formatAdaptiveDate(review.snapshot.reviewLocalDate)}
                      </p>
                      <Badge variant="outline">{stateCopy[review.state]}</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {recommendation?.kind === 'recommendation'
                        ? recommendation.headline
                        : review.snapshot.headline}
                    </p>
                  </div>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
