import { useCallback, useState } from 'react';
import { Plus, SkipForward } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { cn } from '@/lib/utils';

import { useCountdownTimer } from '../hooks/use-countdown-timer';

type StickyRestTimerBarProps = {
  duration: number;
  exerciseName: string;
  onComplete: () => void;
  setNumber: number;
};

export function StickyRestTimerBar({
  duration,
  exerciseName,
  onComplete,
  setNumber,
}: StickyRestTimerBarProps) {
  const [showAddTime, setShowAddTime] = useState(false);

  const { addTime, progress, remainingMs, skip } = useCountdownTimer({
    autoStart: true,
    duration,
    onComplete,
  });

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const isNearEnd = remainingMs > 0 && remainingMs <= 5000;

  const formatTime = useCallback((totalSeconds: number) => {
    if (totalSeconds >= 60) {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
    }
    return `${totalSeconds}s`;
  }, []);

  const handleAddTime = useCallback(() => {
    addTime(15);
    setShowAddTime(true);
    const timeout = window.setTimeout(() => setShowAddTime(false), 800);
    return () => window.clearTimeout(timeout);
  }, [addTime]);

  return (
    <div aria-label="Rest timer" className="mt-2" role="timer">
      <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
        <span className="font-medium opacity-70 dark:text-muted dark:opacity-100">
          {`After ${exerciseName} set ${setNumber}`}
        </span>
        <div className="flex items-center gap-1">
          {showAddTime ? (
            <span className="text-xs font-medium text-emerald-500 animate-in fade-in">+15s</span>
          ) : null}
          <Button
            aria-label="Add 15 seconds"
            className="size-6 shrink-0 cursor-pointer rounded-full"
            onClick={handleAddTime}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Plus aria-hidden="true" className="size-3" />
          </Button>
          <Button
            aria-label="Skip rest timer"
            className="size-6 shrink-0 cursor-pointer rounded-full"
            onClick={skip}
            size="icon"
            type="button"
            variant="ghost"
          >
            <SkipForward aria-hidden="true" className="size-3" />
          </Button>
          <span className="ml-1 font-semibold tabular-nums">{formatTime(remainingSeconds)}</span>
        </div>
      </div>
      <ProgressBar
        aria-label="Rest countdown"
        className={cn(
          'mt-1 space-y-1 [&_[data-slot=progress-bar-track]]:h-2',
          isNearEnd && '[&_[data-slot=progress-bar-fill]]:animate-pulse',
        )}
        color="var(--color-emerald-500, #10b981)"
        max={100}
        value={progress}
      />
    </div>
  );
}
