import { useState } from 'react';
import { CheckCheck, CircleDashed } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { trackingSurfaceClasses } from '@/features/habits/lib/habit-constants';
import type { HabitConfig } from '@/features/habits/types';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type HabitValue = boolean | number | null;

export type DailyHabit = HabitConfig & {
  todayValue: HabitValue;
};

const defaultHabits: DailyHabit[] = [
  {
    id: 'hydrate',
    name: 'Hydrate',
    emoji: '💧',
    trackingType: 'numeric',
    target: 8,
    unit: 'glasses',
    todayValue: 6,
  },
  {
    id: 'vitamins',
    name: 'Take vitamins',
    emoji: '💊',
    trackingType: 'boolean',
    target: null,
    unit: null,
    todayValue: true,
  },
  {
    id: 'protein',
    name: 'Protein goal',
    emoji: '🥗',
    trackingType: 'numeric',
    target: 120,
    unit: 'grams',
    todayValue: 90,
  },
  {
    id: 'sleep',
    name: 'Sleep',
    emoji: '😴',
    trackingType: 'time',
    target: 8,
    unit: 'hours',
    todayValue: 7.5,
  },
  {
    id: 'mobility',
    name: 'Mobility warm-up',
    emoji: '🧘',
    trackingType: 'boolean',
    target: null,
    unit: null,
    todayValue: false,
  },
  {
    id: 'reading',
    name: 'Read',
    emoji: '📚',
    trackingType: 'time',
    target: 1,
    unit: 'hours',
    todayValue: 1,
  },
  {
    id: 'veggies',
    name: 'Veggie servings',
    emoji: '🥦',
    trackingType: 'numeric',
    target: 3,
    unit: 'servings',
    todayValue: 3,
  },
];

const todayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function getHabitCompletion(habit: DailyHabit, value: HabitValue) {
  if (habit.trackingType === 'boolean') {
    return value === true;
  }

  return typeof value === 'number' && habit.target !== null && value >= habit.target;
}

function getProgressText(habit: DailyHabit, value: HabitValue) {
  if (habit.trackingType === 'boolean') {
    return value === true ? 'Completed for today' : 'Ready to check off';
  }

  const currentValue = typeof value === 'number' ? value : 0;
  const formattedCurrent = formatNumber(currentValue);
  const formattedTarget = formatNumber(habit.target ?? 0);
  const unit = habit.unit ?? '';

  return `${formattedCurrent} / ${formattedTarget} ${unit}`.trim();
}

function getProgressPercent(habit: DailyHabit, value: HabitValue) {
  if (habit.trackingType === 'boolean' || habit.target === null || habit.target <= 0) {
    return value === true ? 100 : 0;
  }

  const currentValue = typeof value === 'number' ? value : 0;

  return Math.min((currentValue / habit.target) * 100, 100);
}

function parseInputValue(rawValue: string) {
  if (rawValue.trim() === '') {
    return null;
  }

  const numericValue = Number(rawValue);

  return Number.isFinite(numericValue) ? numericValue : null;
}

type DailyHabitsProps = {
  habits?: DailyHabit[];
};

export function DailyHabits({ habits = defaultHabits }: DailyHabitsProps) {
  const [habitValues, setHabitValues] = useState<Record<string, HabitValue>>(() =>
    Object.fromEntries(habits.map((habit) => [habit.id, habit.todayValue])),
  );

  const completedCount = habits.filter((habit) => getHabitCompletion(habit, habitValues[habit.id]))
    .length;

  return (
    <div className="space-y-4">
      <Card className="border-transparent bg-[var(--color-accent-pink)] text-slate-950 shadow-sm">
        <CardHeader className="gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-700">
            Daily habits
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <CardTitle
                aria-level={2}
                className="text-3xl font-semibold tracking-tight text-slate-950"
                role="heading"
              >
                {todayFormatter.format(new Date())}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm text-slate-700">
                Log today&apos;s routines, keep your streak alive, and spot what still needs
                attention before the day ends.
              </CardDescription>
            </div>
            <div className="inline-flex self-start rounded-full bg-slate-950/10 px-4 py-2 text-sm font-semibold text-slate-900">
              {completedCount} of {habits.length} habits complete
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4">
        {habits.map((habit) => {
          const value = habitValues[habit.id];
          const isComplete = getHabitCompletion(habit, value);
          const progressText = getProgressText(habit, value);
          const progressPercent = getProgressPercent(habit, value);

          return (
            <Card
              key={habit.id}
              className={cn(
                'gap-4 border-transparent py-5 text-slate-950 shadow-sm transition-transform duration-200',
                trackingSurfaceClasses[habit.trackingType],
                isComplete && 'ring-2 ring-emerald-500/40',
              )}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl leading-none" aria-hidden="true">
                      {habit.emoji}
                    </span>
                    <CardTitle
                      aria-level={3}
                      className="text-xl font-semibold text-slate-950"
                      role="heading"
                    >
                      {habit.name}
                    </CardTitle>
                  </div>
                  <CardDescription className="pl-12 text-sm text-slate-700">
                    {progressText}
                  </CardDescription>
                </div>
                <div
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]',
                    isComplete ? 'bg-emerald-600 text-white' : 'bg-slate-950/10 text-slate-700',
                  )}
                >
                  {isComplete ? (
                    <CheckCheck className="size-3.5" />
                  ) : (
                    <CircleDashed className="size-3.5" />
                  )}
                  <span>{isComplete ? 'Done' : 'In progress'}</span>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {habit.trackingType === 'boolean' ? (
                  <label
                    className="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm"
                    htmlFor={`habit-${habit.id}`}
                  >
                    <Checkbox
                      id={`habit-${habit.id}`}
                      aria-label={habit.name}
                      checked={value === true}
                      className="border-slate-900/20 bg-white"
                      onCheckedChange={(checked) => {
                        setHabitValues((currentValues) => ({
                          ...currentValues,
                          [habit.id]: checked === true,
                        }));
                      }}
                    />
                    <span className="text-sm font-medium text-slate-800">
                      Mark this habit complete for today
                    </span>
                  </label>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,9rem)_1fr] sm:items-end">
                    <div className="space-y-2">
                      <label
                        className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700"
                        htmlFor={`habit-${habit.id}`}
                      >
                        {habit.trackingType === 'time' ? 'Hours today' : 'Logged today'}
                      </label>
                      <Input
                        id={`habit-${habit.id}`}
                        aria-label={habit.name}
                        className="h-11 border-slate-900/15 bg-white/75 text-lg font-semibold text-slate-950 placeholder:text-slate-500 focus-visible:border-slate-900/30 focus-visible:ring-slate-900/10"
                        inputMode="decimal"
                        min="0"
                        step={habit.trackingType === 'time' ? '0.25' : '1'}
                        type="number"
                        value={typeof value === 'number' ? value : ''}
                        onChange={(event) => {
                          const nextValue = parseInputValue(event.currentTarget.value);

                          setHabitValues((currentValues) => ({
                            ...currentValues,
                            [habit.id]: nextValue,
                          }));
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-slate-950">{progressText}</span>
                        <span className="text-slate-700">{Math.round(progressPercent)}%</span>
                      </div>
                      <div
                        aria-hidden="true"
                        className="h-2 overflow-hidden rounded-full bg-slate-950/10"
                      >
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-[width] duration-200"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <p className="text-xs font-medium tracking-wide text-slate-700 uppercase">
                        Target: {formatNumber(habit.target ?? 0)} {habit.unit}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
