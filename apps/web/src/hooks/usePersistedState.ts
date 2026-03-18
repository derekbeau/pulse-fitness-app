import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { useDebouncedCallback } from '@/lib/use-debounced-callback';

const PERSIST_DELAY_MS = 200;

type Initializer<T> = T | (() => T);

function canUseLocalStorage() {
  return typeof window !== 'undefined';
}

function resolveInitializerValue<T>(value: Initializer<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

function readStoredValue<T>(key: string, fallback: T) {
  if (!canUseLocalStorage() || !key) {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return fallback;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

export function usePersistedState<T>(
  key: string,
  defaultValue: Initializer<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const normalizedKey = key.trim();
  const defaultValueRef = useRef(defaultValue);
  const [value, setValue] = useState<T>(() =>
    readStoredValue(normalizedKey, resolveInitializerValue(defaultValue)),
  );
  const persistValue = useDebouncedCallback((nextKey: string, nextValue: T) => {
    if (!canUseLocalStorage() || !nextKey) {
      return;
    }

    try {
      window.localStorage.setItem(nextKey, JSON.stringify(nextValue));
    } catch {
      // Ignore persistence failures to keep state updates responsive.
    }
  }, PERSIST_DELAY_MS);

  useEffect(() => {
    defaultValueRef.current = defaultValue;
  }, [defaultValue]);

  useEffect(() => {
    setValue(readStoredValue(normalizedKey, resolveInitializerValue(defaultValueRef.current)));
  }, [normalizedKey]);

  useEffect(() => {
    persistValue.run(normalizedKey, value);
  }, [normalizedKey, persistValue, value]);

  useEffect(() => {
    return () => {
      persistValue.flush();
    };
  }, [persistValue]);

  return [value, setValue];
}
