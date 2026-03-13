import { Apple } from 'lucide-react';
import { useNavigate } from 'react-router';

import { EmptyState } from '@/components/ui/empty-state';
import { HelpIcon } from '@/components/ui/help-icon';
import { FoodList } from '@/features/foods';
import { useFoods } from '@/features/foods/api/foods';

export function FoodsPage() {
  const navigate = useNavigate();
  const foodsQuery = useFoods({
    sort: 'recent',
    page: 1,
    limit: 12,
  });
  const shouldShowEmptyState =
    !foodsQuery.isLoading &&
    !foodsQuery.isError &&
    (foodsQuery.data?.data.length ?? 0) === 0;

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold text-primary">Foods</h1>
        <HelpIcon title="Foods help">
          <p>
            Foods is your personal food database that the AI agent uses to match and log meal items.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Create or edit foods with name, serving size, and macro values.</li>
            <li>Recently used foods are ranked higher so the agent can quickly match your common items.</li>
            <li>Deleting a food soft-deletes it, so you can restore it later from Trash.</li>
            <li>Food changes are snapshot-safe: past meal logs keep their original macro values.</li>
          </ul>
        </HelpIcon>
      </div>
      <p className="max-w-2xl text-sm text-muted">
        Search your saved foods, compare macros at a glance, and sort by recency, popularity, or
        name.
      </p>
      {shouldShowEmptyState ? (
        <EmptyState
          action={{
            label: 'Add Food',
            onClick: () => navigate('/nutrition'),
          }}
          description="Foods will appear here as your agent logs meals."
          icon={Apple}
          title="Your food database is empty"
        />
      ) : (
        <FoodList foodsQuery={foodsQuery} />
      )}
    </section>
  );
}
