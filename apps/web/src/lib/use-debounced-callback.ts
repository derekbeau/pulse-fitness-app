import { useCallback, useEffect, useMemo, useRef } from 'react';

type DebouncedCallback<TArgs extends unknown[]> = {
  cancel: () => void;
  flush: () => void;
  run: (...args: TArgs) => void;
};

const DEFAULT_DELAY_MS = 500;

function serializeArgs(args: unknown[]) {
  try {
    return JSON.stringify(args);
  } catch {
    return '__non_serializable__';
  }
}

export function useDebouncedCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delayMs = DEFAULT_DELAY_MS,
): DebouncedCallback<TArgs> {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<number | null>(null);
  const pendingArgsRef = useRef<TArgs | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const lastInvokedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    pendingArgsRef.current = null;
    pendingKeyRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (!pendingArgsRef.current) {
      return;
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const args = pendingArgsRef.current;
    const key = pendingKeyRef.current;
    pendingArgsRef.current = null;
    pendingKeyRef.current = null;
    callbackRef.current(...args);
    lastInvokedKeyRef.current = key;
  }, []);

  const run = useCallback(
    (...args: TArgs) => {
      const serializedArgs = serializeArgs(args);

      if (
        serializedArgs === pendingKeyRef.current ||
        (timeoutRef.current === null && serializedArgs === lastInvokedKeyRef.current)
      ) {
        return;
      }

      pendingArgsRef.current = args;
      pendingKeyRef.current = serializedArgs;

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        flush();
      }, delayMs);
    },
    [delayMs, flush],
  );

  useEffect(() => cancel, [cancel]);

  return useMemo(() => {
    return {
      cancel,
      flush,
      run,
    };
  }, [cancel, flush, run]);
}
