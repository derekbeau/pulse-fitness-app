import { Link } from 'react-router';

import { StatCard, type StatTrend } from '@/components/ui/stat-card';
import { mockDailySnapshot, type DailySnapshot } from '@/lib/mock-data/dashboard';

type SnapshotCardsProps = {
  snapshot?: DailySnapshot;
};

export const calculateWeightTrend = (weight: number, weightYesterday: number): StatTrend => {
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
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <StatCard
        textClassName="text-[#8b6914]"
        className="bg-[var(--color-accent-cream)]"
        label="Body Weight"
        trend={calculateWeightTrend(snapshot.weight, snapshot.weightYesterday)}
        value={`${snapshot.weight.toFixed(1)} lbs`}
      />

      <StatCard
        textClassName="text-[#8b2252]"
        className="bg-[var(--color-accent-pink)]"
        label="Calories"
        trend={{ direction: 'neutral', value: 0 }}
        value={`${snapshot.macros.calories.actual} / ${snapshot.macros.calories.target}`}
      />

      <StatCard
        textClassName="text-[#1a6b45]"
        className="bg-[var(--color-accent-mint)]"
        label="Protein"
        trend={{ direction: 'neutral', value: 0 }}
        value={`${snapshot.macros.protein.actual}g / ${snapshot.macros.protein.target}g`}
      />

      <Link className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" to="/workouts">
        <StatCard
          textClassName="text-[#2a3f8f] dark:text-[#b4c6ff]"
          className="h-full cursor-pointer bg-[var(--color-primary)]/12 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
          label="Today's Workout"
          value={snapshot.workoutName ?? 'Rest Day'}
        />
      </Link>
    </div>
  );
}
