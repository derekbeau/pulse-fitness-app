import { useEffect, useRef, useState } from 'react';
import { TimerReset } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type RestTimerProps = {
  durationSeconds: number;
  onComplete?: () => void;
};

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');

  return `${minutes}:${seconds}`;
}

export function RestTimer({ durationSeconds, onComplete }: RestTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(durationSeconds);
  const hasCompletedRef = useRef(durationSeconds <= 0);

  useEffect(() => {
    if (remainingSeconds <= 0) {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onComplete?.();
      }

      return;
    }

    const intervalId = window.setInterval(() => {
      setRemainingSeconds((currentValue) => {
        if (currentValue <= 1) {
          window.clearInterval(intervalId);

          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onComplete?.();
          }

          return 0;
        }

        return currentValue - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [onComplete, remainingSeconds]);

  const isDone = remainingSeconds === 0;

  return (
    <Card className="border-transparent bg-[var(--color-accent-mint)] text-slate-950 shadow-sm">
      <CardHeader className="gap-3">
        <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-slate-950/10 text-slate-950">
          <TimerReset />
        </div>
        <div className="space-y-1">
          <CardTitle aria-level={2} className="text-2xl font-semibold text-slate-950" role="heading">
            Rest timer
          </CardTitle>
          <CardDescription className="text-sm text-slate-700">
            Keep your next set honest with a simple second-by-second countdown.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-5xl font-semibold tabular-nums text-slate-950" aria-live="polite">
          {formatDuration(remainingSeconds)}
        </p>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-700">
          {isDone ? 'Done' : 'Counting down'}
        </p>
      </CardContent>
    </Card>
  );
}
