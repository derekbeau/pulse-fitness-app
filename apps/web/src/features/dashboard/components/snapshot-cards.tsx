/* eslint-disable react-refresh/only-export-components */
import type { DashboardSnapshot, DashboardWorkoutSnapshot } from '@pulse/shared';
import { Link } from 'react-router';

import { StatCard } from '@/components/ui/stat-card';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { formatCalories, formatGrams, formatWeight } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

type SnapshotCardsProps = {
  snapshot?: DashboardSnapshot;
};

const notConfiguredCardClassName =
  'border-dashed border-border/80 bg-muted/35 text-muted-foreground shadow-none';
const notConfiguredAccentTextClassName = 'text-muted-foreground';
const longValueClassName = 'text-sm sm:text-base lg:text-lg';
const shortValueClassName = 'text-lg sm:text-xl lg:text-2xl';

export const getSnapshotValueClassName = (value: string) => {
  return value.length >= 13 ? longValueClassName : shortValueClassName;
};

const formatMacroProgressValue = (actual: number, target: number, mode: 'calories' | 'grams') => {
  if (mode === 'grams') {
    return `${formatGrams(actual)} / ${formatGrams(target)}`;
  }

  return `${formatCalories(actual)} / ${formatCalories(target)}`;
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

const getWorkoutHref = (workout: DashboardWorkoutSnapshot | null | undefined): string | null => {
  if (!workout) {
    return null;
  }

  if (workout.status === 'scheduled') {
    return workout.templateId ? `/workouts/templates/${workout.templateId}` : null;
  }

  if (!workout.sessionId) {
    return null;
  }

  if (workout.status === 'in_progress') {
    return `/workouts/sessions/${workout.sessionId}`;
  }

  return `/workouts/sessions/${workout.sessionId}/summary`;
};

const getWorkoutStatusBadge = (status: DashboardWorkoutSnapshot['status']) => {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        badgeClassName:
          'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        dotClassName: 'bg-emerald-500',
      };
    case 'in_progress':
      return {
        label: 'In Progress',
        badgeClassName:
          'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
        dotClassName: 'animate-pulse bg-orange-500',
      };
    case 'scheduled':
    default:
      return {
        label: 'Scheduled',
        badgeClassName: 'border-border bg-background/70 text-muted-foreground',
        dotClassName: 'border border-slate-500 bg-transparent',
      };
  }
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
  const workoutHref = getWorkoutHref(snapshot?.workout);
  const workoutStatusBadge = snapshot?.workout
    ? getWorkoutStatusBadge(snapshot.workout.status)
    : null;
  const workoutCard = (
    <StatCard
      className={cn(
        'col-span-2 border-primary/20 bg-secondary',
        workoutHref
          ? 'cursor-pointer transition-colors hover:border-primary/40 hover:bg-secondary/80'
          : undefined,
      )}
      density="compact"
      data-stagger="4"
      icon={
        workoutStatusBadge ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
              workoutStatusBadge.badgeClassName,
            )}
          >
            <span
              aria-hidden="true"
              className={cn('inline-flex size-2 rounded-full', workoutStatusBadge.dotClassName)}
            />
            {workoutStatusBadge.label}
          </span>
        ) : null
      }
      label="Today's Workout"
      value={workoutValue}
      valueClassName={getSnapshotValueClassName(workoutValue)}
      valueTitle={workoutValue}
    />
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        accentTextClassName={
          snapshot && !hasWeight ? notConfiguredAccentTextClassName : 'text-on-cream'
        }
        className={snapshot && !hasWeight ? notConfiguredCardClassName : accentCardStyles.cream}
        density="compact"
        data-stagger="0"
        label="Body Weight"
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
        density="compact"
        data-stagger="1"
        label="Calories"
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
        density="compact"
        data-stagger="2"
        label="Protein"
        value={proteinValue}
        valueClassName={getSnapshotValueClassName(proteinValueText)}
        valueTitle={hasProteinTarget ? proteinValueText : undefined}
      />

      <StatCard
        accentTextClassName={
          snapshot && !hasHabits ? notConfiguredAccentTextClassName : 'text-on-mint'
        }
        className={snapshot && !hasHabits ? notConfiguredCardClassName : accentCardStyles.mint}
        density="compact"
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

      {workoutHref ? (
        <Link
          aria-label={`Open today's workout: ${snapshot?.workout?.name ?? 'workout'}`}
          className="col-span-2 block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          to={workoutHref}
        >
          {workoutCard}
        </Link>
      ) : (
        workoutCard
      )}
    </div>
  );
}
