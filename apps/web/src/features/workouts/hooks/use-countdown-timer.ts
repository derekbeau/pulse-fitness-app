import { useCallback, useEffect, useRef, useState } from 'react';

type UseCountdownTimerOptions = {
  autoStart?: boolean;
  duration: number;
  onComplete: () => void;
};

type UseCountdownTimerReturn = {
  addTime: (seconds: number) => void;
  isRunning: boolean;
  progress: number;
  remainingMs: number;
  skip: () => void;
};

export function useCountdownTimer({
  autoStart = false,
  duration,
  onComplete,
}: UseCountdownTimerOptions): UseCountdownTimerReturn {
  const intervalIdRef = useRef<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const remainingMsRef = useRef(duration * 1000);
  const totalDurationRef = useRef(duration);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [remainingMs, setRemainingMs] = useState(duration * 1000);
  const [totalDuration, setTotalDuration] = useState(duration);

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

  const progress =
    totalDuration > 0 ? ((totalDuration - remainingMs / 1000) / totalDuration) * 100 : 100;

  const skip = useCallback(() => {
    if (intervalIdRef.current !== null) {
      window.clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    deadlineRef.current = null;
    setIsRunning(false);
    setRemainingMs(0);
    finishTimer(false);
  }, []);

  const addTime = useCallback((seconds: number) => {
    const addMs = seconds * 1000;

    if (deadlineRef.current !== null) {
      deadlineRef.current += addMs;
    }

    remainingMsRef.current += addMs;
    totalDurationRef.current += seconds;
    setRemainingMs((current) => current + addMs);
    setTotalDuration(totalDurationRef.current);
  }, []);

  return {
    addTime,
    isRunning,
    progress: clamp(progress, 0, 100),
    remainingMs,
    skip,
  };

  function finishTimer(shouldVibrate: boolean) {
    if (completedRef.current) {
      return;
    }

    completedRef.current = true;

    if (shouldVibrate && typeof navigator.vibrate === 'function') {
      navigator.vibrate([100, 50, 100]);
    }

    onCompleteRef.current();
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
