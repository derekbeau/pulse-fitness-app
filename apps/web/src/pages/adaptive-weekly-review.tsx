import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import {
  WeeklyReviewError,
  WeeklyReviewEvidence,
  WeeklyReviewLoading,
  useAdaptiveWeeklyReview,
} from '@/features/adaptive-nutrition';

export function AdaptiveWeeklyReviewPage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const query = useAdaptiveWeeklyReview(reviewId ?? null, Boolean(reviewId));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-10" data-slot="weekly-review-page">
      <Link
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        to="/nutrition?view=coach"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Nutrition Coach
      </Link>
      <PageHeader
        description="Inspect the immutable records, exclusions, context, calculations, and decision history behind this weekly review."
        icon={
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <ClipboardCheck aria-hidden="true" className="size-5" />
          </span>
        }
        title="Weekly Review Evidence"
      />
      {query.isLoading ? <WeeklyReviewLoading /> : null}
      {query.isError || !reviewId ? (
        <WeeklyReviewError onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? <WeeklyReviewEvidence review={query.data} /> : null}
    </div>
  );
}
