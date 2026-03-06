import { StatCard, type StatTrend } from '@/components/ui/stat-card';
import { mockDailySnapshot, type DailySnapshot } from '@/lib/mock-data/dashboard';

type SnapshotCardsProps = {
  snapshot?: DailySnapshot;
};

const toWeightTrend = (weight: number, weightYesterday: number): StatTrend => {
  if (weightYesterday <= 0) {
    return { direction: 'neutral', value: 0 };
  }

  const change = weight - weightYesterday;

  if (change === 0) {
    return { direction: 'neutral', value: 0 };
  }

  const percent = Number(((Math.abs(change) / weightYesterday) * 100).toFixed(1));

  return {
    direction: change > 0 ? 'up' : 'down',
    value: percent,
  };
};

export function SnapshotCards({ snapshot = mockDailySnapshot }: SnapshotCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        className="bg-[var(--color-accent-cream)]"
        label="Body Weight"
        trend={toWeightTrend(snapshot.weight, snapshot.weightYesterday)}
        value={`${snapshot.weight.toFixed(1)} lbs`}
      />

      <StatCard
        className="bg-[var(--color-accent-pink)]"
        label="Calories"
        trend={{ direction: 'neutral', value: 0 }}
        value={`${snapshot.macros.calories.actual} / ${snapshot.macros.calories.target}`}
      />

      <StatCard
        className="bg-[var(--color-accent-mint)]"
        label="Protein"
        trend={{ direction: 'neutral', value: 0 }}
        value={`${snapshot.macros.protein.actual}g / ${snapshot.macros.protein.target}g`}
      />

      <StatCard
        className="bg-primary/10"
        label="Today's Workout"
        value={snapshot.workoutName ?? 'Rest Day'}
      />
    </div>
  );
}
