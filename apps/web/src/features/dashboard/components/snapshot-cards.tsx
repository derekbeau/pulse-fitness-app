/* eslint-disable react-refresh/only-export-components */
import type { DashboardSnapshot, DashboardWorkoutSnapshot } from '@pulse/shared';

import { StatCard, type StatTrend } from '@/components/ui/stat-card';
import { accentCardStyles } from '@/lib/accent-card-styles';

type SnapshotCardsProps = {
  snapshot?: DashboardSnapshot;
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

export const calculateHabitCompletionPercent = (
  habitsCompleted: number,
  habitsTotal: number,
): number => {
  if (habitsTotal <= 0) {
    return 0;
  }

  return Math.round((habitsCompleted / habitsTotal) * 100);
};

const formatWeightValue = (snapshot: DashboardSnapshot | undefined) => {
  if (!snapshot?.weight) {
    return '--';
  }

  return `${snapshot.weight.value.toFixed(1)} lbs`;
};

const formatWorkoutStatus = (status: DashboardWorkoutSnapshot['status']) => {
  return status
    .split('_')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
};

export function SnapshotCards({ snapshot }: SnapshotCardsProps) {
  const habitCompletionPercent = snapshot
    ? calculateHabitCompletionPercent(snapshot.habits.completed, snapshot.habits.total)
    : 0;
  const weightValue = formatWeightValue(snapshot);
  const caloriesValue = snapshot
    ? `${snapshot.macros.actual.calories} / ${snapshot.macros.target.calories}`
    : '--';
  const proteinValue = snapshot
    ? `${snapshot.macros.actual.protein}g / ${snapshot.macros.target.protein}g`
    : '--';
  const habitsValue = snapshot
    ? `${snapshot.habits.completed} / ${snapshot.habits.total} complete`
    : '--';
  const workoutValue = snapshot?.workout
    ? `${snapshot.workout.name} (${formatWorkoutStatus(snapshot.workout.status)})`
    : snapshot
      ? 'Rest Day'
      : '--';

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <StatCard
        accentTextClassName="text-on-cream"
        className={accentCardStyles.cream}
        data-stagger="0"
        label="Body Weight"
        trend={{ direction: 'neutral', value: 0 }}
        value={weightValue}
      />

      <StatCard
        accentTextClassName="text-on-pink"
        className={accentCardStyles.pink}
        data-stagger="1"
        label="Calories"
        trend={{ direction: 'neutral', value: 0 }}
        value={caloriesValue}
      />

      <StatCard
        accentTextClassName="text-on-mint"
        className={accentCardStyles.mint}
        data-stagger="2"
        label="Protein"
        trend={{ direction: 'neutral', value: 0 }}
        value={proteinValue}
      />

      <StatCard
        accentTextClassName="text-on-mint"
        className={accentCardStyles.mint}
        data-stagger="3"
        label="Habits"
        trend={{ direction: 'neutral', value: habitCompletionPercent }}
        value={habitsValue}
      />

      <StatCard
        className="border-primary/20 bg-secondary"
        data-stagger="4"
        label="Today's Workout"
        value={workoutValue}
      />
    </div>
  );
}
