/* eslint-disable react-refresh/only-export-components */
import { StatCard, type StatTrend } from '@/components/ui/stat-card';
import { accentCardStyles } from '@/lib/accent-card-styles';
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
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <StatCard
        accentTextClassName="text-on-cream"
        className={accentCardStyles.cream}
        data-stagger="0"
        label="Body Weight"
        trend={calculateWeightTrend(snapshot.weight, snapshot.weightYesterday)}
        value={`${snapshot.weight.toFixed(1)} lbs`}
      />

      <StatCard
        accentTextClassName="text-on-pink"
        className={accentCardStyles.pink}
        data-stagger="1"
        label="Calories"
        trend={{ direction: 'neutral', value: 0 }}
        value={`${snapshot.macros.calories.actual} / ${snapshot.macros.calories.target}`}
      />

      <StatCard
        accentTextClassName="text-on-mint"
        className={accentCardStyles.mint}
        data-stagger="2"
        label="Protein"
        trend={{ direction: 'neutral', value: 0 }}
        value={`${snapshot.macros.protein.actual}g / ${snapshot.macros.protein.target}g`}
      />

      <StatCard
        className="border-primary/20 bg-secondary"
        data-stagger="3"
        label="Today's Workout"
        value={snapshot.workoutName ?? 'Rest Day'}
      />
    </div>
  );
}
