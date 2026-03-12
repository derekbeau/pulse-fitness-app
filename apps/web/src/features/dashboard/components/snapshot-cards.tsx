/* eslint-disable react-refresh/only-export-components */
import type { DashboardSnapshot, DashboardWorkoutSnapshot } from '@pulse/shared';
import { Link } from 'react-router';

import { StatCard, type StatTrend } from '@/components/ui/stat-card';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { formatCalories, formatGrams, formatTrendChange, formatWeight } from '@/lib/format-utils';

type SnapshotCardsProps = {
  snapshot?: DashboardSnapshot;
};

const notConfiguredCardClassName =
  'border-dashed border-border/80 bg-muted/35 text-muted-foreground shadow-none';
const notConfiguredAccentTextClassName = 'text-muted-foreground';
const longValueClassName = 'text-lg sm:text-xl lg:text-2xl';
const shortValueClassName = 'text-2xl sm:text-2xl lg:text-3xl';

export const getSnapshotValueClassName = (value: string) => {
  return value.length >= 13 ? longValueClassName : shortValueClassName;
};

const formatMacroProgressValue = (actual: number, target: number, mode: 'calories' | 'grams') => {
  if (mode === 'grams') {
    return `${formatGrams(actual)} / ${formatGrams(target)}`;
  }

  return `${formatCalories(actual)} / ${formatCalories(target)}`;
};

export const calculateWeightTrend = (weight: number, weightYesterday: number): StatTrend => {
  if (weightYesterday <= 0) {
    return { direction: 'neutral', value: 0 };
  }

  const change = weight - weightYesterday;

  if (change === 0) {
    return { direction: 'neutral', value: 0 };
  }

  const percent = Number(formatTrendChange((Math.abs(change) / weightYesterday) * 100));

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
  if (!snapshot) {
    return '--';
  }

  if (!snapshot?.weight) {
    return 'Log weight';
  }

  return formatWeight(snapshot.weight.value, 'lbs');
};

const formatWorkoutStatus = (status: DashboardWorkoutSnapshot['status']) => {
  return status
    .split('_')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
};

export function SnapshotCards({ snapshot }: SnapshotCardsProps) {
  const hasWeight = !!snapshot?.weight;
  const hasCaloriesTarget = (snapshot?.macros.target.calories ?? 0) > 0;
  const hasProteinTarget = (snapshot?.macros.target.protein ?? 0) > 0;
  const hasHabits = (snapshot?.habits.total ?? 0) > 0;
  const habitCompletionPercent = snapshot
    ? calculateHabitCompletionPercent(snapshot.habits.completed, snapshot.habits.total)
    : 0;

  const weightValue = formatWeightValue(snapshot);
  const caloriesValueText = snapshot
    ? hasCaloriesTarget
      ? formatMacroProgressValue(
          snapshot.macros.actual.calories,
          snapshot.macros.target.calories,
          'calories',
        )
      : 'No targets set'
    : '--';
  const caloriesValue = snapshot
    ? hasCaloriesTarget
      ? caloriesValueText
      : [
          <span key="text">No targets set</span>,
          ' ',
          <Link key="link" className="font-semibold underline underline-offset-2" to="/settings">
            Settings
          </Link>,
        ]
    : '--';

  const proteinValueText = snapshot
    ? hasProteinTarget
      ? formatMacroProgressValue(
          snapshot.macros.actual.protein,
          snapshot.macros.target.protein,
          'grams',
        )
      : 'No targets set'
    : '--';
  const proteinValue = snapshot
    ? hasProteinTarget
      ? proteinValueText
      : [
          <span key="text">No targets set</span>,
          ' ',
          <Link key="link" className="font-semibold underline underline-offset-2" to="/settings">
            Settings
          </Link>,
        ]
    : '--';

  const habitsValueText = snapshot
    ? hasHabits
      ? `${snapshot.habits.completed}/${snapshot.habits.total}`
      : 'No habits'
    : '--';
  const workoutValue = snapshot?.workout
    ? `${snapshot.workout.name} (${formatWorkoutStatus(snapshot.workout.status)})`
    : snapshot
      ? 'Rest Day'
      : '--';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      <StatCard
        accentTextClassName={
          snapshot && !hasWeight ? notConfiguredAccentTextClassName : 'text-on-cream'
        }
        className={snapshot && !hasWeight ? notConfiguredCardClassName : accentCardStyles.cream}
        data-stagger="0"
        label="Body Weight"
        trend={snapshot && hasWeight ? { direction: 'neutral', value: 0 } : undefined}
        value={weightValue}
        valueClassName={getSnapshotValueClassName(weightValue)}
        valueTitle={weightValue}
      />

      <StatCard
        accentTextClassName={
          snapshot && !hasCaloriesTarget ? notConfiguredAccentTextClassName : 'text-on-pink'
        }
        className={
          snapshot && !hasCaloriesTarget ? notConfiguredCardClassName : accentCardStyles.pink
        }
        data-stagger="1"
        label="Calories"
        trend={snapshot && hasCaloriesTarget ? { direction: 'neutral', value: 0 } : undefined}
        value={caloriesValue}
        valueClassName={getSnapshotValueClassName(caloriesValueText)}
        valueTitle={hasCaloriesTarget ? caloriesValueText : undefined}
      />

      <StatCard
        accentTextClassName={
          snapshot && !hasProteinTarget ? notConfiguredAccentTextClassName : 'text-on-mint'
        }
        className={
          snapshot && !hasProteinTarget ? notConfiguredCardClassName : accentCardStyles.mint
        }
        data-stagger="2"
        label="Protein"
        trend={snapshot && hasProteinTarget ? { direction: 'neutral', value: 0 } : undefined}
        value={proteinValue}
        valueClassName={getSnapshotValueClassName(proteinValueText)}
        valueTitle={hasProteinTarget ? proteinValueText : undefined}
      />

      <StatCard
        accentTextClassName={
          snapshot && !hasHabits ? notConfiguredAccentTextClassName : 'text-on-mint'
        }
        className={snapshot && !hasHabits ? notConfiguredCardClassName : accentCardStyles.mint}
        data-stagger="3"
        label="Habits"
        trend={
          snapshot && hasHabits
            ? { direction: 'neutral', value: habitCompletionPercent }
            : undefined
        }
        value={habitsValueText}
        valueClassName={getSnapshotValueClassName(habitsValueText)}
        valueTitle={habitsValueText}
      />

      <StatCard
        className="border-primary/20 bg-secondary"
        data-stagger="4"
        label="Today's Workout"
        value={workoutValue}
        valueClassName={getSnapshotValueClassName(workoutValue)}
        valueTitle={workoutValue}
      />
    </div>
  );
}
