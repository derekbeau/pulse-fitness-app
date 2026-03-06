import { MacroRings } from '@/features/dashboard/components/macro-rings';
import { SnapshotCards } from '@/features/dashboard/components/snapshot-cards';

export function DashboardPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-semibold text-primary">Dashboard</h1>
      <SnapshotCards />
      <MacroRings />
    </section>
  );
}
