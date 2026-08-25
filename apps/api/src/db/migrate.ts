import type Database from 'better-sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';

import {
  assertAdaptiveProgramRevisionProjection,
  planAdaptiveProgramRevisionProjection,
  populateAdaptiveProgramRevisionProjection,
} from './adaptive-program-revision-projection.js';
import { runWithForeignKeysDisabled } from './integrity.js';

export const ADAPTIVE_PROGRAM_REVISION_PROJECTION_MIGRATION_MILLIS = 1787788800000;

type PulseMigrationOptions = {
  migrationsFolder: string;
  beforeProjectionCommit?: () => void;
};

const tableExists = (sqlite: Database.Database, name: string) =>
  Boolean(
    sqlite.prepare(`select 1 from sqlite_master where type = 'table' and name = ?`).get(name),
  );

const latestAppliedMigration = (sqlite: Database.Database) => {
  if (!tableExists(sqlite, '__drizzle_migrations')) return undefined;
  return sqlite
    .prepare(
      `select hash, created_at as createdAt
         from __drizzle_migrations
        order by created_at desc
        limit 1`,
    )
    .get() as { hash: string; createdAt: number } | undefined;
};

/**
 * Canonical synchronous migration entrypoint for Pulse SQLite databases.
 *
 * Migration 0056 needs the application-owned IANA date resolver. Its strict
 * source-ledger preflight therefore runs before the 0056 DDL, and its complete
 * projection is populated and verified before the Drizzle journal row is
 * inserted. The surrounding SQLite transaction makes that boundary atomic.
 */
export const migratePulseDatabase = (sqlite: Database.Database, options: PulseMigrationOptions) => {
  const migrations = readMigrationFiles({ migrationsFolder: options.migrationsFolder });

  return runWithForeignKeysDisabled(sqlite, () => {
    sqlite.exec(
      `create table if not exists __drizzle_migrations (
         id serial primary key,
         hash text not null,
         created_at numeric
       )`,
    );

    const lastApplied = latestAppliedMigration(sqlite);
    if (
      lastApplied &&
      Number(lastApplied.createdAt) >= ADAPTIVE_PROGRAM_REVISION_PROJECTION_MIGRATION_MILLIS
    ) {
      assertAdaptiveProgramRevisionProjection(sqlite);
    }

    const pending = migrations.filter(
      (migration) => !lastApplied || Number(lastApplied.createdAt) < migration.folderMillis,
    );
    if (pending.length === 0) return { applied: 0, projectionRevisions: undefined };

    let projectionRevisions: number | undefined;
    const apply = sqlite.transaction(() => {
      for (const migration of pending) {
        let projectionPlan;
        if (migration.folderMillis === ADAPTIVE_PROGRAM_REVISION_PROJECTION_MIGRATION_MILLIS) {
          // This read-only plan validates every full snapshot, timezone,
          // sequence, timestamp, and causal local date before 0056 changes schema.
          projectionPlan = planAdaptiveProgramRevisionProjection(sqlite);
        }

        for (const statement of migration.sql) {
          if (statement.trim()) sqlite.exec(statement);
        }

        if (projectionPlan) {
          const result = populateAdaptiveProgramRevisionProjection(sqlite, projectionPlan);
          projectionRevisions = result.revisions;
          options.beforeProjectionCommit?.();
        }

        sqlite
          .prepare(
            `insert into __drizzle_migrations (hash, created_at)
             values (?, ?)`,
          )
          .run(migration.hash, migration.folderMillis);
      }
    });

    apply.immediate();
    return { applied: pending.length, projectionRevisions };
  });
};
