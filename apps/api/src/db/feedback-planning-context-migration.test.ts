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

function stageInterruptedMigration(root: string) {
  const destination = stageThrough(root, 64);
  const journalPath = join(destination, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
  journal.entries.push({
    idx: 65,
    version: '6',
    when: 1789084800001,
    tag: '0065_synthetic_interrupted_feedback_planning',
    breakpoints: true,
  });
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  writeFileSync(
    join(destination, '0065_synthetic_interrupted_feedback_planning.sql'),
    'CREATE TABLE synthetic_interrupted_feedback_planning(id TEXT PRIMARY KEY);\n--> statement-breakpoint\nTHIS IS INVALID SQL;\n',
  );
  return destination;
}

function sourceCounts(sqlite: Database.Database) {
  return {
    sessions: (
      sqlite.prepare('SELECT count(*) AS count FROM workout_sessions').get() as {
        count: number;
      }
    ).count,
    definitions: (
      sqlite
        .prepare('SELECT count(*) AS count FROM workout_feedback_question_definitions')
        .get() as {
        count: number;
      }
    ).count,
    answerRevisions: (
      sqlite.prepare('SELECT count(*) AS count FROM workout_feedback_answer_revisions').get() as {
        count: number;
      }
    ).count,
    currentAnswers: (
      sqlite.prepare('SELECT count(*) AS count FROM workout_feedback_answer_current').get() as {
        count: number;
      }
    ).count,
  };
}

function seedCurrent(sqlite: Database.Database) {
  const legacyBlob = JSON.stringify({ synthetic: true, exact: 'unchanged' });
  sqlite.exec(`
    INSERT INTO users(id,username,password_hash) VALUES
      ('owner-a','synthetic-a','hash'),('owner-b','synthetic-b','hash');
    INSERT INTO workout_sessions(id,user_id,name,date,status,started_at,completed_at,feedback)
      VALUES('session-a','owner-a','Synthetic','2026-09-08','completed',1,2,'${legacyBlob}');
    INSERT INTO workout_feedback_question_lists(id,user_id,scope_kind,scope_id,current_revision,source,updated_at)
      VALUES('list-a','owner-a','session','session-a',1,'ad_hoc',1);
    INSERT INTO workout_feedback_question_list_revisions(id,list_id,user_id,revision,source,actor_kind,created_at)
      VALUES('list-revision-a','list-a','owner-a',1,'ad_hoc','user',1);
    INSERT INTO workout_feedback_question_definitions(id,list_revision_id,user_id,question_id,definition_version,order_index,prompt,type,timing,definition)
      VALUES('definition-a','list-revision-a','owner-a','q',1,0,'Synthetic?','yes_no','post_session',json_object('id','q','version',1,'revisionId','question-r1','priorRevisionId',NULL,'prompt','Synthetic?','optional',1,'timing','post_session','sourceKind','user','sourceActorId','owner-a','sourceActorName',NULL,'authoredAt','2026-09-08T00:00:00.000Z','type','yes_no','config',json('{}')));
    INSERT INTO workout_feedback_answer_sets(id,user_id,session_id,current_revision,updated_at)
      VALUES('answer-set-a','owner-a','session-a',1,2);
    INSERT INTO workout_feedback_answer_revisions(id,answer_set_id,user_id,session_id,response_id,question_id,definition_version,revision,state,timing,answer,answered_at,created_at)
      VALUES('answer-r1','answer-set-a','owner-a','session-a','response-a','q',1,1,'answered','post_session',json_object('questionId','q','definitionVersion',1,'state','answered','value',1,'responseId','response-a','revision',1,'priorRevisionId',NULL,'answeredAt','2026-09-08T00:01:00.000Z','timing','post_session','respondentSource','user','respondentActorId','owner-a'),'2026-09-08T00:01:00.000Z',2);
    INSERT INTO workout_feedback_answer_current(answer_set_id,user_id,session_id,question_id,definition_version,response_revision_id,revision)
      VALUES('answer-set-a','owner-a','session-a','q',1,'answer-r1',1);
  `);
  return legacyBlob;
}

function healthy(sqlite: Database.Database) {
  expect(sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
}

describe('feedback planning context migration', () => {
  afterEach(() => {
    while (temporaryDirectories.length) {
      const directory = temporaryDirectories.pop();
      if (directory) rmSync(directory, { recursive: true, force: true });
    }
  });

  it('upgrades an exact through-0062 database without rewriting historical feedback and restores the predecessor', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-feedback-151-upgrade-'));
    temporaryDirectories.push(root);
    const path = join(root, 'upgrade.db');
    const backup = join(root, 'through-0062.db');
    let sqlite = new Database(path);
    sqlite.pragma('foreign_keys = ON');
    migrate(drizzle(sqlite), { migrationsFolder: stageThrough(root, 62) });
    const legacyBlob = seedCurrent(sqlite);
    const countsBefore = sourceCounts(sqlite);
    sqlite.close();
    copyFileSync(path, backup);

    sqlite = new Database(path);
    sqlite.pragma('foreign_keys = ON');
    migrate(drizzle(sqlite), { migrationsFolder });
    expect(
      (
        sqlite.prepare("SELECT feedback FROM workout_sessions WHERE id='session-a'").get() as {
          feedback: string;
        }
      ).feedback,
    ).toBe(legacyBlob);
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM workout_feedback_planning_decisions').get(),
    ).toEqual({ count: 0 });
    expect(sourceCounts(sqlite)).toEqual(countsBefore);
    healthy(sqlite);
    migrate(drizzle(sqlite), { migrationsFolder });
    healthy(sqlite);
    sqlite.close();

    copyFileSync(backup, join(root, 'restored.db'));
    const restored = new Database(join(root, 'restored.db'));
    expect(
      restored
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='workout_feedback_planning_decisions'",
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(
      (
        restored.prepare("SELECT feedback FROM workout_sessions WHERE id='session-a'").get() as {
          feedback: string;
        }
      ).feedback,
    ).toBe(legacyBlob);
    restored.close();
  });

  it('rolls back an actually interrupted migration without partial schema or journal state', () => {
    const root = mkdtempSync(join(tmpdir(), 'pulse-feedback-151-interrupted-'));
    temporaryDirectories.push(root);
    const sqlite = new Database(join(root, 'interrupted.db'));
    sqlite.pragma('foreign_keys = ON');
    migrate(drizzle(sqlite), { migrationsFolder });
    seedCurrent(sqlite);
    const countsBefore = sourceCounts(sqlite);
    const journalBefore = (
      sqlite.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get() as {
        count: number;
      }
    ).count;

    expect(() =>
      migrate(drizzle(sqlite), { migrationsFolder: stageInterruptedMigration(root) }),
    ).toThrow();
    expect(
      sqlite
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='synthetic_interrupted_feedback_planning'",
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(sqlite.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()).toEqual({
      count: journalBefore,
    });
    expect(sourceCounts(sqlite)).toEqual(countsBefore);
    healthy(sqlite);
    sqlite.close();
  });

  it('installs fresh and enforces owner links, append-only history, cascade purge, and atomic rollback', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    migrate(drizzle(sqlite), { migrationsFolder });
    seedCurrent(sqlite);
    const insertDecision = (
      id: string,
      owner = 'owner-a',
      sequence = 1,
      sourceSessionId = 'session-a',
      priorDecisionId: string | null = null,
    ) =>
      sqlite
        .prepare(
          `INSERT INTO workout_feedback_planning_decisions(id,user_id,concern_ref,sequence,prior_decision_id,source_session_id,source_exercise_id,source_section,source_text,source_text_hash,source_timestamp,source_classification,disposition,interpretation,reason,actor_type,actor_id,actor_label,dependencies,dependency_fingerprint,input,target_mutations,idempotency_key,request_fingerprint,created_at)
           VALUES(?,?, 'concern-a',?,?,?, 'exercise-a','main','Synthetic note',?,1,'programming_precaution','retain','Synthetic interpretation','Synthetic reason','agent_token','agent-a','Agent A','[]',?,'{}','[]',?, ?,2)`,
        )
        .run(
          id,
          owner,
          sequence,
          priorDecisionId,
          sourceSessionId,
          'a'.repeat(64),
          'b'.repeat(64),
          `key-${id}`,
          'c'.repeat(64),
        );

    expect(() => insertDecision('foreign', 'owner-b')).toThrow(/owner/iu);
    const transaction = sqlite.transaction(() => {
      insertDecision('rolled-back');
      throw new Error('synthetic interrupted transaction');
    });
    expect(() => transaction()).toThrow('synthetic interrupted transaction');
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM workout_feedback_planning_decisions').get(),
    ).toEqual({ count: 0 });

    insertDecision('decision-a');
    sqlite
      .prepare(
        "INSERT INTO workout_feedback_planning_decision_responses(decision_id,user_id,response_revision_id) VALUES('decision-a','owner-a','answer-r1')",
      )
      .run();
    expect(() =>
      sqlite
        .prepare(
          "UPDATE workout_feedback_planning_decisions SET reason='rewrite' WHERE id='decision-a'",
        )
        .run(),
    ).toThrow(/immutable/iu);
    sqlite
      .prepare(
        "INSERT INTO workout_sessions(id,user_id,name,date,status,started_at,completed_at) VALUES('session-b','owner-a','Synthetic B','2026-09-09','completed',3,4)",
      )
      .run();
    insertDecision('decision-b', 'owner-a', 2, 'session-b', 'decision-a');
    sqlite.prepare("DELETE FROM workout_sessions WHERE id='session-a'").run();
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM workout_feedback_planning_decisions').get(),
    ).toEqual({ count: 0 });
    expect(
      sqlite
        .prepare('SELECT count(*) AS count FROM workout_feedback_planning_decision_responses')
        .get(),
    ).toEqual({ count: 0 });
    healthy(sqlite);
    sqlite.close();
  });
});
