import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('adaptive goal migration rehearsal', () => {
  it('uses the canonical atomic Pulse migration runner', () => {
    const source = readFileSync(
      new URL('./rehearse-adaptive-goal-migration.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("import { migratePulseDatabase } from '../db/migrate.js'");
    expect(source).toContain('migratePulseDatabase(sqlite');
    expect(source).not.toContain("from 'drizzle-orm/better-sqlite3/migrator'");
  });
});
