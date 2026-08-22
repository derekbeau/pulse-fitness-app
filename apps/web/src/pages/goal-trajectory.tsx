import { ArrowLeft, Route } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { GoalTrajectoryWorkspace } from '@/features/adaptive-nutrition';

export function GoalTrajectoryPage() {
  const { goalId } = useParams<{ goalId: string }>();
  const [searchParams] = useSearchParams();
  if (!goalId) return null;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-10" data-slot="goal-trajectory-page">
      <Link
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        to="/nutrition?view=coach"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Nutrition Coach
      </Link>
      <PageHeader
        description="Follow Adaptive model progress, pace, estimates, weekly evidence, and immutable goal revisions without changing your plan."
        icon={
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Route aria-hidden="true" className="size-5" />
          </span>
        }
        title="Goal trajectory"
      />
      <GoalTrajectoryWorkspace goalId={goalId} end={searchParams.get('end') ?? undefined} />
    </div>
  );
}
