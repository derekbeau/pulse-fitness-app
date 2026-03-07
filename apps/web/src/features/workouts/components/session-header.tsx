import { useEffect, useState } from 'react';
import { Clock3, Dumbbell, ListChecks } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { cn } from '@/lib/utils';

type SessionHeaderProps = {
  className?: string;
  completedSets: number;
  currentExercise: number;
  startTime: Date | string;
  totalExercises: number;
  totalSets: number;
  workoutName: string;
};

export function SessionHeader({
  className,
  completedSets,
  currentExercise,
  startTime,
  totalExercises,
  totalSets,
  workoutName,
}: SessionHeaderProps) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const elapsedSeconds = getElapsedSeconds(startTime, currentTime);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <Card
      className={cn(
        `overflow-hidden py-0 shadow-lg backdrop-blur-sm ${accentCardStyles.cream}`,
        className,
      )}
    >
      <CardContent className="space-y-5 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-[0.22em] uppercase opacity-70 dark:text-muted dark:opacity-100">
              Active session
            </p>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">{workoutName}</h1>
              <p className="text-sm opacity-75 dark:text-muted dark:opacity-100">
                {`Exercise ${currentExercise} of ${totalExercises}`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-80">
            <SessionStat icon={Clock3} label="Elapsed" value={formatElapsedTime(elapsedSeconds)} />
            <SessionStat
              icon={Dumbbell}
              label="Exercises"
              value={`${currentExercise}/${totalExercises}`}
            />
            <SessionStat
              icon={ListChecks}
              label="Sets done"
              value={`${completedSets}/${totalSets}`}
            />
            <div className="rounded-2xl border border-black/10 bg-white/45 p-3 dark:border-border dark:bg-secondary/60">
              <p className="text-[11px] font-semibold tracking-[0.18em] uppercase opacity-65 dark:text-muted dark:opacity-100">
                Progress
              </p>
              <p className="mt-1 text-lg font-semibold">{`${Math.round((completedSets / Math.max(totalSets, 1)) * 100)}%`}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium opacity-70 dark:text-muted dark:opacity-100">
              Set progress
            </span>
            <span className="font-semibold">{`${completedSets} / ${totalSets}`}</span>
          </div>
          <ProgressBar
            aria-label="Workout progress"
            color="var(--color-primary)"
            max={totalSets}
            value={completedSets}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SessionStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/45 p-3 dark:border-border dark:bg-secondary/60">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase opacity-65 dark:text-muted dark:opacity-100">
        <Icon aria-hidden="true" className="size-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function getElapsedSeconds(startTime: Date | string, currentTime: number) {
  const startedAt = new Date(startTime).getTime();
  const elapsedMilliseconds = currentTime - startedAt;

  return Math.max(0, Math.floor(elapsedMilliseconds / 1000));
}

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${`${minutes}`.padStart(2, '0')}:${`${seconds}`.padStart(2, '0')}`;
}
