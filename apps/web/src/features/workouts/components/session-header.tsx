import { useEffect, useState } from 'react';
import { Clock3, Dumbbell, ListChecks } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ProgressBar } from '@/components/ui/progress-bar';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { cn } from '@/lib/utils';

type SessionHeaderProps = {
  className?: string;
  completedSets: number;
  currentExercise: number;
  estimatedTotalSeconds?: number;
  remainingSeconds?: number;
  startTime: Date | string;
  totalExercises: number;
  totalSets: number;
  workoutName: string;
  isUpdatingStartTime?: boolean;
  onStartTimeChange?: (startTime: string) => void;
};

export function SessionHeader({
  className,
  completedSets,
  currentExercise,
  estimatedTotalSeconds = 0,
  remainingSeconds = 0,
  startTime,
  totalExercises,
  totalSets,
  workoutName,
  isUpdatingStartTime = false,
  onStartTimeChange,
}: SessionHeaderProps) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isEditingStartTime, setIsEditingStartTime] = useState(false);
  const [startTimeInput, setStartTimeInput] = useState(() => toTimeInputValue(startTime));
  const elapsedSeconds = getElapsedSeconds(startTime, currentTime);
  const formattedStartTime = formatStartTime(startTime);
  const totalEstimateLabel = formatApproxMinutes(estimatedTotalSeconds);
  const remainingEstimateLabel = formatApproxMinutes(remainingSeconds);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setStartTimeInput(toTimeInputValue(startTime));
  }, [startTime]);

  const canEditStartTime = typeof onStartTimeChange === 'function';

  return (
    <>
      <div className="sticky top-0 z-20 bg-background/95 px-1 py-2 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
          <span className="font-medium opacity-70 dark:text-muted dark:opacity-100">
            Set progress
          </span>
          <span className="font-semibold">{`${completedSets} / ${totalSets}`}</span>
        </div>
        <ProgressBar
          aria-label="Workout progress"
          className="mt-1 space-y-1 [&_[data-slot=progress-bar-track]]:h-2"
          color="var(--color-primary)"
          max={totalSets}
          value={completedSets}
        />
      </div>

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
                <p className="text-sm opacity-75 dark:text-muted dark:opacity-100">{`${remainingEstimateLabel} remaining (${totalEstimateLabel} total)`}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-80">
              <SessionStat
                icon={Clock3}
                label="Elapsed"
                value={formatElapsedTime(elapsedSeconds)}
              />
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
                  Estimated
                </p>
                <p className="mt-1 text-lg font-semibold">{remainingEstimateLabel}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-white/45 px-3 py-2 dark:border-border dark:bg-secondary/60">
            <span className="text-[11px] font-semibold tracking-[0.18em] uppercase opacity-65 dark:text-muted dark:opacity-100">
              Start time
            </span>

            {isEditingStartTime && canEditStartTime ? (
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Start time"
                  className="h-8 w-[104px]"
                  onChange={(event) => setStartTimeInput(event.target.value)}
                  step={60}
                  type="time"
                  value={startTimeInput}
                />
                <Button
                  className="h-8 px-3 text-xs"
                  disabled={isUpdatingStartTime || startTimeInput.length === 0}
                  onClick={() => {
                    if (!onStartTimeChange) {
                      return;
                    }

                    onStartTimeChange(toIsoStringFromTimeInput(startTime, startTimeInput));
                    setIsEditingStartTime(false);
                  }}
                  type="button"
                  variant="secondary"
                >
                  Set
                </Button>
              </div>
            ) : (
              <button
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  canEditStartTime ? 'cursor-pointer underline-offset-2 hover:underline' : '',
                )}
                disabled={!canEditStartTime || isUpdatingStartTime}
                onClick={() => {
                  setStartTimeInput(toTimeInputValue(startTime));
                  setIsEditingStartTime(true);
                }}
                type="button"
              >
                {formattedStartTime}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
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

function formatStartTime(startTime: Date | string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startTime));
}

function toTimeInputValue(startTime: Date | string) {
  const date = new Date(startTime);
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');

  return `${hours}:${minutes}`;
}

function toIsoStringFromTimeInput(startTime: Date | string, value: string) {
  const [hours, minutes] = value.split(':').map((segment) => Number.parseInt(segment, 10));
  const date = new Date(startTime);

  date.setHours(hours, minutes, 0, 0);

  return date.toISOString();
}

function formatApproxMinutes(totalSeconds: number) {
  const safeSeconds = Math.max(totalSeconds, 0);
  const roundedMinutes = Math.round(safeSeconds / 60);

  return `~${roundedMinutes} min`;
}
