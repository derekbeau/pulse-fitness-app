import { BackLink } from '@/components/layout/back-link';
import { WeightHistory } from '@/features/weight/components/weight-history';

export function WeightHistoryPage() {
  return (
    <main className="space-y-2">
      <BackLink label="Back to Dashboard" to="/" />
      <h1 className="text-3xl font-semibold text-primary">Weight History</h1>
      <p className="max-w-2xl text-sm text-muted">
        Review your full body weight log and remove entries you no longer want to keep.
      </p>
      <WeightHistory />
    </main>
  );
}
