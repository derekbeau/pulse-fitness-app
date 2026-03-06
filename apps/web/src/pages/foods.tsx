import { FoodList } from '@/features/foods';

export function FoodsPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-semibold text-primary">Foods</h1>
      <p className="max-w-2xl text-sm text-muted">
        Search your saved foods, compare macros at a glance, and sort by recency or protein density.
      </p>
      <FoodList />
    </section>
  );
}
