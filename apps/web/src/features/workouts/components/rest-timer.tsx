import { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipForward } from 'lucide-react';

import { Button } from '@/components/ui/button';

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
  const progress = duration > 0 ? (remainingMs / (duration * 1000)) * 100 : 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampPercent(progress) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div
        aria-label="Rest countdown"
        aria-valuemax={duration}
        aria-valuemin={0}
        aria-valuenow={remainingSeconds}
        className="relative inline-flex items-center justify-center"
        role="progressbar"
      >
        <svg
          aria-hidden="true"
          className="-rotate-90 drop-shadow-sm"
          height="132"
          viewBox="0 0 132 132"
          width="132"
        >
          <circle
            cx="66"
            cy="66"
            data-slot="rest-timer-track"
            fill="none"
            r={radius}
            stroke="color-mix(in srgb, var(--color-on-accent) 18%, transparent)"
            strokeWidth="10"
          />
          <circle
            cx="66"
            cy="66"
            data-slot="rest-timer-indicator"
            fill="none"
            r={radius}
            stroke="var(--color-primary)"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            strokeWidth="10"
          />
        </svg>

        <div className="absolute flex flex-col items-center">
          <span className="text-[11px] font-semibold tracking-[0.18em] text-[var(--color-on-accent)]/70 uppercase">
            Rest
          </span>
          <span className="text-3xl font-semibold text-[var(--color-on-accent)]">{`${remainingSeconds}s`}</span>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-44">
        <Button
          className="h-11 cursor-pointer rounded-2xl border-[var(--color-on-accent)]/25 bg-white/55 text-[var(--color-on-accent)] hover:bg-white/70"
          onClick={() => {
            if (isRunning) {
              const pausedRemainingMs =
                deadlineRef.current === null ? remainingMs : Math.max(deadlineRef.current - Date.now(), 0);
              setRemainingMs(pausedRemainingMs);
            }

            setIsRunning((current) => !current);
          }}
          type="button"
          variant="ghost"
        >
          {isRunning ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
          {isRunning ? 'Pause' : 'Resume'}
        </Button>

        <Button
          className="h-11 cursor-pointer rounded-2xl border-[var(--color-on-accent)]/25 bg-white/45 text-[var(--color-on-accent)] hover:bg-white/60"
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
          type="button"
          variant="ghost"
        >
          <SkipForward aria-hidden="true" className="size-4" />
          Skip
        </Button>
      </div>
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
