import { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipForward } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';

type RestTimerProps = {
  autoStart?: boolean;
  duration?: number;
  onComplete: () => void;
};

export function RestTimer({ autoStart = false, duration = 60, onComplete }: RestTimerProps) {
  const intervalIdRef = useRef<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const remainingMsRef = useRef(duration * 1000);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [remainingMs, setRemainingMs] = useState(duration * 1000);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    remainingMsRef.current = remainingMs;
  }, [remainingMs]);

  useEffect(() => {
    if (!isRunning) {
      deadlineRef.current = null;
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      return;
    }

    deadlineRef.current = Date.now() + remainingMsRef.current;
    intervalIdRef.current = window.setInterval(() => {
      if (deadlineRef.current === null) {
        return;
      }

      const nextRemainingMs = Math.max(deadlineRef.current - Date.now(), 0);
      setRemainingMs(nextRemainingMs);

      if (nextRemainingMs === 0) {
        if (intervalIdRef.current !== null) {
          window.clearInterval(intervalIdRef.current);
          intervalIdRef.current = null;
        }
        deadlineRef.current = null;
        setIsRunning(false);
        finishTimer(true);
      }
    }, 100);

    return () => {
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [isRunning]);

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const progress = duration > 0 ? ((duration - remainingMs / 1000) / duration) * 100 : 100;
  const clampedProgress = clampPercent(progress);

  return (
    <div className="flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white/45 px-3 py-2 dark:border-border dark:bg-secondary/60">
      <span className="text-sm font-medium text-foreground">{`Rest: ${remainingSeconds}s`}</span>
      <div className="flex-1">
        <ProgressBar
          aria-label="Rest countdown"
          className="[&_[data-slot=progress-bar-track]]:h-2"
          color="var(--color-primary)"
          max={100}
          value={clampedProgress}
        />
      </div>
      <Button
        aria-label={isRunning ? 'Pause' : 'Resume'}
        className="size-8 cursor-pointer rounded-full"
        onClick={() => {
          if (isRunning) {
            const pausedRemainingMs =
              deadlineRef.current === null ? remainingMs : Math.max(deadlineRef.current - Date.now(), 0);
            setRemainingMs(pausedRemainingMs);
          }

          setIsRunning((current) => !current);
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        {isRunning ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
      </Button>

      <Button
        aria-label="Skip"
        className="size-8 cursor-pointer rounded-full"
        onClick={() => {
          if (intervalIdRef.current !== null) {
            window.clearInterval(intervalIdRef.current);
            intervalIdRef.current = null;
          }
          deadlineRef.current = null;
          setIsRunning(false);
          setRemainingMs(0);
          finishTimer(false);
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        <SkipForward aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );

  function finishTimer(shouldVibrate: boolean) {
    if (completedRef.current) {
      return;
    }

    completedRef.current = true;

    if (shouldVibrate && typeof navigator.vibrate === 'function') {
      navigator.vibrate(200);
    }

    onCompleteRef.current();
  }
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export type { RestTimerProps };
