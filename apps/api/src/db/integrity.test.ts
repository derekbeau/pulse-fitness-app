import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertDatabaseIntegrity,
  DatabaseIntegrityError,
  inspectDatabaseIntegrity,
  runWithForeignKeysDisabled,
} from './integrity.js';

let sqlite: Database.Database;

describe('database integrity preflight', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(`
      create table users (id text primary key not null);
      create table exercises (
        id text primary key not null,
        user_id text references users(id)
      );
      create table workout_sessions (
        id text primary key not null,
        user_id text not null references users(id)
      );
      create table workout_templates (
        id text primary key not null,
        user_id text not null references users(id)
      );
      create table session_sets (
        id text primary key not null,
        session_id text not null references workout_sessions(id),
        exercise_id text references exercises(id)
      );
      create table template_exercises (
        id text primary key not null,
        template_id text not null references workout_templates(id),
        exercise_id text not null references exercises(id)
      );
      insert into users (id) values ('user-1'), ('user-2');
      insert into exercises (id, user_id)
      values ('owned-exercise', 'user-1'), ('global-exercise', null), ('other-exercise', 'user-2');
      insert into workout_sessions (id, user_id) values ('session-1', 'user-1');
      insert into workout_templates (id, user_id) values ('template-1', 'user-1');
      insert into session_sets (id, session_id, exercise_id)
      values ('set-1', 'session-1', 'owned-exercise');
      insert into template_exercises (id, template_id, exercise_id)
      values ('template-row-1', 'template-1', 'global-exercise');
    `);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('passes a clean database and returns aggregate evidence', () => {
    expect(assertDatabaseIntegrity(sqlite, 'test')).toEqual({
      foreignKeyEnforcementEnabled: true,
      foreignKeyViolationCount: 0,
      foreignKeyViolationsByRelation: [],
      ownershipViolationCount: 0,
      ownershipViolationsByRelation: [],
      quickCheck: ['ok'],
    });
  });

  it('fails on foreign-key violations without reporting row identifiers', () => {
    sqlite.pragma('foreign_keys = OFF');
    sqlite.exec(`
      insert into session_sets (id, session_id, exercise_id)
      values ('private-row-id', 'session-1', 'private-missing-exercise-id');
    `);
    sqlite.pragma('foreign_keys = ON');

    let captured: DatabaseIntegrityError | null = null;
    try {
      assertDatabaseIntegrity(sqlite, 'migration preflight');
    } catch (error) {
      captured = error as DatabaseIntegrityError;
    }

    expect(captured).toBeInstanceOf(DatabaseIntegrityError);
    expect(captured?.report).toMatchObject({
      foreignKeyViolationCount: 1,
      foreignKeyViolationsByRelation: [
        { childTable: 'session_sets', count: 1, parentTable: 'exercises' },
      ],
    });
    expect(captured?.message).not.toContain('private-row-id');
    expect(captured?.message).not.toContain('private-missing-exercise-id');
  });

  it('detects ownership violations that ordinary foreign keys cannot express', () => {
    sqlite.exec(`
      insert into session_sets (id, session_id, exercise_id)
      values ('cross-user-set', 'session-1', 'other-exercise');
    `);

    const report = inspectDatabaseIntegrity(sqlite);

    expect(report.foreignKeyViolationCount).toBe(0);
    expect(report.ownershipViolationCount).toBe(1);
    expect(report.ownershipViolationsByRelation).toEqual([
      { relation: 'session_sets.exercise_id', count: 1 },
    ]);
    expect(() => assertDatabaseIntegrity(sqlite, 'test')).toThrow(DatabaseIntegrityError);
  });

  it('always restores foreign-key enforcement when a migration operation throws', () => {
    expect(() =>
      runWithForeignKeysDisabled(sqlite, () => {
        expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(0);
        throw new Error('migration failed');
      }),
    ).toThrow('migration failed');
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('refuses to begin a migration window if enforcement is already disabled', () => {
    sqlite.pragma('foreign_keys = OFF');
    expect(() => runWithForeignKeysDisabled(sqlite, () => undefined)).toThrow(
      'foreign-key enforcement is already disabled',
    );
  });
});
