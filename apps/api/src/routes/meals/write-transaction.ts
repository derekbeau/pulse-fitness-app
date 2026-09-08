import { setTimeout as delay } from 'node:timers/promises';

type DatabaseModule = typeof import('../../db/index.js');
type Transaction = Parameters<Parameters<DatabaseModule['db']['transaction']>[0]>[0];
const BACKOFF_MS = [25, 50, 100] as const;

const isSqliteLockError = (error: unknown): boolean => {
  // Drizzle can wrap driver errors in a query error. Never retry other failures.
  for (let depth = 0; depth < 5 && typeof error === 'object' && error !== null; depth++) {
    const current = error as { code?: unknown; cause?: unknown };
    if (typeof current.code === 'string' && /^SQLITE_(BUSY|LOCKED)(_|$)/u.test(current.code))
      return true;
    error = current.cause;
  }
  return false;
};

/** Four attempts, 175ms total backoff; every attempt reruns the entire write unit. */
export const runMealWrite = async <T>(
  write: (tx: Transaction, afterCommit: (effect: () => void) => void) => T,
): Promise<T> => {
  const { db, sqlite } = await import('../../db/index.js');
  for (let attempt = 0; ; attempt++) {
    const effects: Array<() => void> = [];
    let result: T;
    try {
      // No await while changing this connection's timeout. Restore it before yielding.
      // Avoid SQLite's default blocking wait multiplying the explicit retry bound.
      const previousTimeout = sqlite.pragma('busy_timeout', { simple: true }) as number;
      try {
        sqlite.pragma('busy_timeout = 0');
        result = db.transaction((tx) => write(tx, (effect) => effects.push(effect)), {
          behavior: 'immediate',
        });
      } finally {
        sqlite.pragma(`busy_timeout = ${previousTimeout}`);
      }
    } catch (error) {
      const backoff = BACKOFF_MS[attempt];
      if (backoff === undefined || !isSqliteLockError(error)) throw error;
      await delay(backoff);
      continue;
    }
    // Failed attempts never publish created IDs into response enrichment.
    for (const effect of effects) effect();
    return result;
  }
};
