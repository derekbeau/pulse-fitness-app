import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migratePulseDatabase } from './migrate.js';
import { runFeedbackMigration } from './feedback-provenance-migration.js';
import { inventoryFeedbackNotes } from './feedback-note-remediation.js';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const acknowledgement = 'I_ACKNOWLEDGE_SYNTHETIC_FIXTURE_ONLY';
describe('source-linked coaching note remediation', () => {
  it('preserves originals, queues uncertain prose, and supersedes only an owned exact causal link', () => {
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      migratePulseDatabase(db, {
        migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
      });
      db.exec(`CREATE TABLE pulse_synthetic_fixture(purpose TEXT,version INTEGER);
    INSERT INTO pulse_synthetic_fixture VALUES('feedback-provenance-149',1);
    INSERT INTO users(id,username,password_hash) VALUES('a','synthetic-a','hash'),('b','synthetic-b','hash');`);
      const raw = JSON.stringify({
        energy: 3,
        recovery: 2,
        technique: 4,
        responses: [{ id: 'pain-discomfort', label: 'Any pain?', type: 'yes_no', value: true }],
      });
      const insert = db.prepare(
        "INSERT INTO workout_sessions(id,user_id,name,date,status,started_at,completed_at,feedback,notes) VALUES(?,?,'Synthetic','2026-09-08','completed',100,200,?,?)",
      );
      insert.run('confirmed', 'a', raw, 'Recovery score 2/5 suggests fatigue.');
      insert.run(
        'uncertain',
        'a',
        null,
        'Technique rating may explain the earlier coaching decision.',
      );
      insert.run('unrelated', 'b', null, 'Use the blue bench.');
      const before = db.prepare('SELECT * FROM workout_sessions ORDER BY id').all() as {
        id: string;
        notes: string;
      }[];
      const source = inventoryFeedbackNotes(db).find((note) => note.parentId === 'confirmed');
      if (!source) throw new Error('Missing synthetic confirmed note');
      const links = [
        {
          userId: 'a',
          sourceId: source.sourceId,
          noteChecksum: hash(source.text),
          sessionId: 'confirmed',
          construct: 'recovery' as const,
          sourceChecksum: hash(raw),
          evidenceId: 'synthetic-explicit-causal-ledger-1',
        },
      ];
      const options = {
        mode: 'dry-run' as const,
        classifiedAt: '2026-09-08T00:00:00.000Z',
        acknowledgement,
        noteLinks: links,
      };
      const original = db.serialize();
      const dry = runFeedbackMigration(db, options);
      expect(dry.noteCounts).toEqual({ examined: 3, confirmed: 1, pending: 1, preserved: 1 });
      expect(db.serialize()).toEqual(original);
      const applied = runFeedbackMigration(db, { ...options, mode: 'apply' });
      expect(applied.noteWrites).toMatchObject({
        examined: 3,
        confirmed: 1,
        pending: 1,
        preserved: 1,
      });
      expect(db.prepare('SELECT id,notes FROM workout_sessions ORDER BY id').all()).toEqual(
        before.map((row) => ({ id: row.id, notes: row.notes })),
      );
      expect(
        db.prepare('SELECT state,raw_text FROM feedback_note_dispositions ORDER BY state').all(),
      ).toEqual([
        {
          state: 'pending_review',
          raw_text: 'Technique rating may explain the earlier coaching decision.',
        },
        { state: 'superseded', raw_text: 'Recovery score 2/5 suggests fatigue.' },
      ]);
      expect(runFeedbackMigration(db, { ...options, mode: 'apply' }).noteWrites).toMatchObject({
        confirmed: 0,
        pending: 0,
        unchanged: 2,
      });
      expect(
        db
          .prepare('SELECT count(*) AS count FROM feedback_note_dispositions WHERE user_id = ?')
          .get('b'),
      ).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });
});
