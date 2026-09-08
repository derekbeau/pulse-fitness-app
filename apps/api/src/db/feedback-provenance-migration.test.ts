import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { migratePulseDatabase } from './migrate.js';
import { describe, expect, it } from 'vitest';
import {
  runFeedbackMigration,
  rollbackFeedbackMigration,
} from './feedback-provenance-migration.js';
const acknowledgement = 'I_ACKNOWLEDGE_SYNTHETIC_FIXTURE_ONLY';
const options = {
  mode: 'apply' as const,
  classifiedAt: '2026-09-08T00:00:00.000Z',
  acknowledgement,
  batchSize: 2,
};
function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migratePulseDatabase(db, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  });
  db.exec(`CREATE TABLE pulse_synthetic_fixture(purpose TEXT,version INTEGER);
    INSERT INTO pulse_synthetic_fixture VALUES('feedback-provenance-149',1);
    INSERT INTO users(id,username,password_hash) VALUES('owner-a','fictional-a','synthetic-hash'),('owner-b','fictional-b','synthetic-hash');`);
  const insert = db.prepare(
    "INSERT INTO workout_sessions(id,user_id,feedback,notes,started_at,completed_at,name,date,status) VALUES(?,?,?,?,100,200,'Synthetic Session','2026-09-08','completed')",
  );
  const payloads = [
    {
      energy: 5,
      recovery: 2,
      technique: 4,
      responses: [
        {
          id: 'pain-discomfort',
          label: 'Any pain?',
          type: 'yes_no',
          value: true,
          notes: '  exact pain note  ',
        },
        { id: 'session-rpe', label: 'Session RPE', type: 'scale', value: 8 },
      ],
    },
    {
      energy: 3,
      recovery: 4,
      technique: 3,
      responses: [{ id: 'pain-discomfort', label: 'Any pain?', type: 'yes_no', value: false }],
    },
    {
      energy: 3,
      recovery: 3,
      technique: 3,
      responses: [
        { id: 'custom-zero', label: 'Custom', type: 'slider', value: 0 },
        { id: 'empty', label: 'Empty', type: 'text', value: '' },
        { id: 'null', label: 'Null', type: 'text', value: null },
      ],
    },
    {
      energy: 3,
      recovery: 3,
      technique: 3,
      enteredBy: 'historic-agent-without-proof',
      responses: [
        {
          id: 'technique-revision-a',
          revisionId: 'a',
          label: 'Technique',
          type: 'scale',
          construct: 'technique',
          value: 2,
        },
        {
          id: 'technique-revision-b',
          revisionId: 'b',
          label: 'Technique',
          type: 'scale',
          construct: 'technique',
          value: 4,
        },
        { id: 'absent', label: 'Absent', type: 'text' },
        { id: 'skipped', label: 'Skipped', type: 'text', state: 'skipped' },
      ],
    },
  ];
  for (const [index, payload] of payloads.entries())
    insert.run(
      `session-${index}`,
      index < 2 ? 'owner-a' : 'owner-b',
      JSON.stringify(payload),
      index === 0 ? 'Technique rating 2 informed this synthetic note.' : 'original session note',
    );
  insert.run('session-none', 'owner-b', null, 'unrelated note');
  db.exec(
    "INSERT INTO session_sets(id,session_id,rir,rpe,set_number,completed) VALUES('set-a','session-0',0,NULL,1,1)",
  );
  return db;
}
const snapshot = (db: Database.Database) =>
  JSON.stringify({
    sessions: db.prepare('SELECT * FROM workout_sessions ORDER BY id').all(),
    sets: db.prepare('SELECT * FROM session_sets ORDER BY id').all(),
  });
describe('synthetic-only feedback migration', () => {
  it('requires exact source proof for derived history and preserves explicit native answers with evidenced actors', () => {
    const db = fixture();
    try {
      const explicit = JSON.stringify({
        energy: 3,
        recovery: 2,
        technique: 4,
        responses: [
          {
            id: 'recovery-explicit',
            label: 'Recovery',
            type: 'scale',
            construct: 'recovery',
            value: 2,
          },
          {
            id: 'technique-explicit',
            label: 'Technique',
            type: 'scale',
            construct: 'technique',
            value: 4,
          },
        ],
      });
      db.prepare('UPDATE workout_sessions SET feedback = ? WHERE id = ?').run(
        explicit,
        'session-2',
      );
      const source = db
        .prepare('SELECT feedback FROM workout_sessions WHERE id = ?')
        .get('session-0') as { feedback: string };
      const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');
      runFeedbackMigration(db, {
        ...options,
        sourceProofs: [
          {
            userId: 'owner-a',
            sessionId: 'session-0',
            sourceChecksum: hash(source.feedback),
            evidenceId: 'synthetic-generator-receipt-1',
            generated: [
              {
                construct: 'recovery',
                sourceResponseId: 'pain-discomfort',
                generatorVersion: 'pulse-pre-149-pain-recovery',
              },
              {
                construct: 'technique',
                sourceResponseId: 'session-rpe',
                generatorVersion: 'pulse-pre-149-rpe-technique',
              },
            ],
          },
          {
            userId: 'owner-b',
            sessionId: 'session-2',
            sourceChecksum: hash(explicit),
            evidenceId: 'synthetic-agent-submission-2',
            actor: { kind: 'agent_token', id: 'synthetic-agent' },
          },
        ],
      });
      const read = (id: string) =>
        JSON.parse(
          (
            db.prepare('SELECT feedback FROM workout_sessions WHERE id = ?').get(id) as {
              feedback: string;
            }
          ).feedback,
        );
      expect(read('session-0')).toMatchObject({
        recovery: null,
        technique: null,
        provenance: {
          recovery: { source: 'legacy_derived' },
          technique: { source: 'legacy_derived' },
        },
      });
      expect(read('session-2')).toMatchObject({
        recovery: 2,
        technique: 4,
        provenance: {
          recovery: { source: 'explicit_agent_or_other_response', actorId: 'synthetic-agent' },
        },
      });
      expect(read('session-1').provenance.recovery.source).toBe('legacy_unknown');
    } finally {
      db.close();
    }
  });
  it('dry-run writes nothing and reconciles owner/global counts', () => {
    const db = fixture();
    try {
      const before = db.serialize();
      const result = runFeedbackMigration(db, { ...options, mode: 'dry-run' });
      expect(db.serialize()).toEqual(before);
      expect(result.global).toMatchObject({ scanned: 5, migrated: 4, quarantined: 4, skipped: 1 });
      expect(result.owners['owner-a'].scanned).toBe(2);
      expect(result.owners['owner-b'].scanned).toBe(3);
    } finally {
      db.close();
    }
  });
  it('preserves raw payloads/native performance and makes second apply a no-op', () => {
    const db = fixture();
    try {
      const originals = db
        .prepare('SELECT id,feedback FROM workout_sessions WHERE feedback IS NOT NULL ORDER BY id')
        .all() as { id: string; feedback: string }[];
      const sets = db.prepare('SELECT * FROM session_sets').all();
      runFeedbackMigration(db, options);
      for (const source of originals)
        expect(
          db
            .prepare('SELECT raw_payload FROM feedback_provenance_audit WHERE session_id = ?')
            .get(source.id),
        ).toEqual({ raw_payload: source.feedback });
      expect(db.prepare('SELECT * FROM session_sets').all()).toEqual(sets);
      const after = db.serialize();
      expect(runFeedbackMigration(db, options).global).toMatchObject({
        scanned: 5,
        migrated: 0,
        unchangedOnResume: 4,
        skipped: 1,
      });
      expect(db.serialize()).toEqual(after);
    } finally {
      db.close();
    }
  });
  it('rolls back the failed batch and resumes committed batches exactly once', () => {
    const db = fixture();
    try {
      expect(() =>
        runFeedbackMigration(db, {
          ...options,
          failBeforeBatchCommit: (batch) => {
            if (batch === 1) throw new Error('synthetic failure');
          },
        }),
      ).toThrow('synthetic failure');
      expect(db.prepare('SELECT count(*) AS count FROM feedback_provenance_audit').get()).toEqual({
        count: 2,
      });
      expect(runFeedbackMigration(db, options).global).toMatchObject({
        migrated: 2,
        unchangedOnResume: 2,
      });
      expect(db.prepare('SELECT count(*) AS count FROM feedback_provenance_audit').get()).toEqual({
        count: 4,
      });
    } finally {
      db.close();
    }
  });
  it('forced first-batch failure preserves original database exactly', () => {
    const db = fixture();
    try {
      const before = db.serialize();
      expect(() =>
        runFeedbackMigration(db, {
          ...options,
          failBeforeBatchCommit: () => {
            throw new Error('synthetic failure');
          },
        }),
      ).toThrow('synthetic failure');
      expect(db.serialize()).toEqual(before);
    } finally {
      db.close();
    }
  });
  it('restores exact source payloads while retaining immutable audit', () => {
    const db = fixture();
    try {
      const before = snapshot(db);
      runFeedbackMigration(db, options);
      expect(rollbackFeedbackMigration(db, acknowledgement)).toEqual({ restored: 4 });
      expect(snapshot(db)).toBe(before);
      expect(
        db
          .prepare(
            'SELECT count(*) AS count FROM feedback_note_dispositions WHERE rolled_back_at IS NULL',
          )
          .get(),
      ).toEqual({ count: 0 });
      expect(db.prepare('SELECT count(*) AS count FROM feedback_provenance_audit').get()).toEqual({
        count: 4,
      });
    } finally {
      db.close();
    }
  });
  it('refuses tampered original-source ledger checksums for every source record', () => {
    const db = fixture();
    try {
      runFeedbackMigration(db, options);
      const rows = db
        .prepare('SELECT session_id, source_checksum FROM feedback_migration_ledger')
        .all() as { session_id: string; source_checksum: string }[];
      expect(rows).toHaveLength(5);
      for (const row of rows) {
        db.prepare(
          'UPDATE feedback_migration_ledger SET source_checksum = ? WHERE session_id = ?',
        ).run('tampered', row.session_id);
        expect(() => runFeedbackMigration(db, options)).toThrow('checksum/version conflict');
        db.prepare(
          'UPDATE feedback_migration_ledger SET source_checksum = ? WHERE session_id = ?',
        ).run(row.source_checksum, row.session_id);
      }
      expect(() => runFeedbackMigration(db, options)).not.toThrow();
    } finally {
      db.close();
    }
  });
  it('refuses missing manifest, schema mismatch, corrupt audit and later source edits', () => {
    const db = fixture();
    try {
      expect(() => runFeedbackMigration(db, { ...options, acknowledgement: '' })).toThrow(
        'acknowledgement',
      );
      db.exec('ALTER TABLE workout_sessions RENAME COLUMN feedback TO incompatible');
      expect(() => runFeedbackMigration(db, options)).toThrow('schema columns');
      db.exec('ALTER TABLE workout_sessions RENAME COLUMN incompatible TO feedback');
      runFeedbackMigration(db, options);
      db.prepare('UPDATE workout_sessions SET feedback = ? WHERE id = ?').run('{}', 'session-0');
      expect(() => runFeedbackMigration(db, options)).toThrow('checksum/version conflict');
      expect(() => rollbackFeedbackMigration(db, acknowledgement)).toThrow('later edit');
    } finally {
      db.close();
    }
  });
});
