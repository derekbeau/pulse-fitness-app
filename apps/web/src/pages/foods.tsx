import { Apple } from 'lucide-react';
import { useNavigate } from 'react-router';

import { EmptyState } from '@/components/ui/empty-state';
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
      <h1 className="text-3xl font-semibold text-primary">Foods</h1>
      <p className="max-w-2xl text-sm text-muted">
        Search your saved foods, compare macros at a glance, and sort by recency or protein density.
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
