import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const temporaryDirectories: string[] = [];

type Journal = {
  version: string;
  dialect: string;
  entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
};

function stageThrough(root: string, maximumIndex: number) {
  const destination = join(root, `through-${maximumIndex}`);
  mkdirSync(join(destination, 'meta'), { recursive: true });
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as Journal;
  const entries = journal.entries.filter((entry) => entry.idx <= maximumIndex);
  writeFileSync(
    join(destination, 'meta/_journal.json'),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
  );
  for (const entry of entries) {
    copyFileSync(join(migrationsFolder, `${entry.tag}.sql`), join(destination, `${entry.tag}.sql`));
  }
  return destination;
}

function seedPredecessor(sqlite: Database.Database) {
  const rawFeedback = JSON.stringify({
    schemaVersion: 2,
    energy: null,
    recovery: null,
    technique: null,
    responses: [
      { id: 'energy-post-workout', label: 'Energy post workout', type: 'emoji', value: '🙂' },
      { id: 'shoulder', label: 'Old shoulder question', type: 'scale', value: 0 },
    ],
    provenance: {
      energy: {
        source: 'legacy_unknown',
        actorType: 'unknown',
        actorId: null,
        classifiedAt: '2026-09-08T00:00:00.000Z',
      },
      recovery: {
        source: 'legacy_unknown',
        actorType: 'unknown',
        actorId: null,
        classifiedAt: '2026-09-08T00:00:00.000Z',
      },
      technique: {
        source: 'legacy_unknown',
        actorType: 'unknown',
        actorId: null,
        classifiedAt: '2026-09-08T00:00:00.000Z',
      },
    },
  });
  sqlite.exec(`
    INSERT INTO users(id,username,password_hash) VALUES
      ('owner-a','fictional-owner-a','synthetic-hash'),
      ('owner-b','fictional-owner-b','synthetic-hash');
    INSERT INTO workout_templates(id,user_id,name,tags) VALUES
      ('template-a','owner-a','Synthetic tib bar','[]'),
      ('template-b','owner-b','Foreign template','[]');
    INSERT INTO scheduled_workouts(id,user_id,template_id,date) VALUES
      ('schedule-a','owner-a','template-a','2026-09-08');
  `);
  sqlite
    .prepare(
      "INSERT INTO workout_sessions(id,user_id,template_id,scheduled_workout_id,name,date,status,started_at,completed_at,feedback) VALUES('session-a','owner-a','template-a','schedule-a','Synthetic tib bar','2026-09-08','completed',100,200,?)",
    )
    .run(rawFeedback);
  return rawFeedback;
}

function expectHealthy(sqlite: Database.Database) {
  expect(sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
}

describe('workout feedback question migration', () => {
  afterEach(() => {
    while (temporaryDirectories.length) {
      const directory = temporaryDirectories.pop();
      if (directory) rmSync(directory, { recursive: true, force: true });
    }
  });

  it('upgrades an exact through-0061 fixture, preserves #149 bytes, and restores the untouched predecessor', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-feedback-150-upgrade-'));
    temporaryDirectories.push(root);
    const databasePath = join(root, 'upgrade.db');
    const backupPath = join(root, 'through-0061-untouched.db');
    let sqlite = new Database(databasePath);
    sqlite.pragma('foreign_keys = ON');
    migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 61) });
    const rawFeedback = seedPredecessor(sqlite);
    sqlite.close();
    copyFileSync(databasePath, backupPath);

    sqlite = new Database(databasePath);
    sqlite.pragma('foreign_keys = ON');
    migrate(drizzle(sqlite), { migrationsFolder });
    expect(
      (
        sqlite.prepare("SELECT feedback FROM workout_sessions WHERE id='session-a'").get() as {
          feedback: string;
        }
      ).feedback,
    ).toBe(rawFeedback);
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM workout_feedback_question_lists').get(),
    ).toEqual({ count: 0 });
    expectHealthy(sqlite);
    migrate(drizzle(sqlite), { migrationsFolder });
    expectHealthy(sqlite);
    sqlite.close();

    copyFileSync(backupPath, join(root, 'restored.db'));
    const restored = new Database(join(root, 'restored.db'));
    restored.pragma('foreign_keys = ON');
    expect(
      (
        restored.prepare("SELECT feedback FROM workout_sessions WHERE id='session-a'").get() as {
          feedback: string;
        }
      ).feedback,
    ).toBe(rawFeedback);
    expect(
      restored
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='workout_feedback_question_lists'",
        )
        .get(),
    ).toEqual({ count: 0 });
    expectHealthy(restored);
    restored.close();
  });

  it('installs the full current journal on an empty database', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    try {
      migrate(drizzle(sqlite), { migrationsFolder });
      const names = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'workout_feedback_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      expect(names.map(({ name }) => name)).toEqual([
        'workout_feedback_answer_current',
        'workout_feedback_answer_revisions',
        'workout_feedback_answer_sets',
        'workout_feedback_question_definitions',
        'workout_feedback_question_list_revisions',
        'workout_feedback_question_lists',
      ]);
      expectHealthy(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it('enforces owner links, exact revision order, immutable rows, and atomic rollback', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    migrate(drizzle(sqlite), { migrationsFolder });
    seedPredecessor(sqlite);
    const insertPartial = sqlite.transaction(() => {
      sqlite
        .prepare(
          "INSERT INTO workout_feedback_question_lists(id,user_id,scope_kind,scope_id,current_revision,source,updated_at) VALUES('list-a','owner-a','session','session-a',0,'ad_hoc',1)",
        )
        .run();
      sqlite
        .prepare(
          "INSERT INTO workout_feedback_question_list_revisions(id,list_id,user_id,revision,prior_revision_id,source,actor_kind,created_at) VALUES('list-r1','list-a','owner-a',1,NULL,'ad_hoc','user',1)",
        )
        .run();
      throw new Error('synthetic failure after partial work');
    });
    expect(() => insertPartial()).toThrow('synthetic failure');
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM workout_feedback_question_lists').get(),
    ).toEqual({ count: 0 });

    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO workout_feedback_question_lists(id,user_id,scope_kind,scope_id,current_revision,source,updated_at) VALUES('foreign','owner-b','session','session-a',0,'ad_hoc',1)",
        )
        .run(),
    ).toThrow(/owner/iu);

    sqlite
      .prepare(
        "INSERT INTO workout_feedback_question_lists(id,user_id,scope_kind,scope_id,current_revision,source,updated_at) VALUES('list-a','owner-a','session','session-a',0,'ad_hoc',1)",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO workout_feedback_question_list_revisions(id,list_id,user_id,revision,prior_revision_id,source,actor_kind,created_at) VALUES('list-r1','list-a','owner-a',1,NULL,'ad_hoc','user',1)",
      )
      .run();
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO workout_feedback_question_list_revisions(id,list_id,user_id,revision,prior_revision_id,source,actor_kind,created_at) VALUES('list-r3','list-a','owner-a',3,'list-r1','ad_hoc','user',2)",
        )
        .run(),
    ).toThrow(/revision order/iu);
    expect(() =>
      sqlite
        .prepare(
          "UPDATE workout_feedback_question_list_revisions SET source='legacy_import' WHERE id='list-r1'",
        )
        .run(),
    ).toThrow(/immutable/iu);
    expectHealthy(sqlite);
    sqlite.close();
  });
});
