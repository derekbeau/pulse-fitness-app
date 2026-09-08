import Database from 'better-sqlite3';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePulseDatabase } from '../db/migrate.js';
import {
  runFeedbackMigration,
  rollbackFeedbackMigration,
} from '../db/feedback-provenance-migration.js';

const root = mkdtempSync(join(realpathSync(tmpdir()), 'pulse-feedback-synthetic-'));
const path = join(root, 'fixture.db');
const db = new Database(path);
db.pragma('foreign_keys = ON');
migratePulseDatabase(db, {
  migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
});
db.exec(`CREATE TABLE pulse_synthetic_fixture(purpose TEXT,version INTEGER);
 INSERT INTO pulse_synthetic_fixture VALUES('feedback-provenance-149',1);
 INSERT INTO users(id,username,password_hash) VALUES('synthetic-a','synthetic-a','fictional'),('synthetic-b','synthetic-b','fictional');`);
const insert = db.prepare(
  "INSERT INTO workout_sessions(id,user_id,name,date,status,started_at,completed_at,feedback,notes) VALUES(?,?,'Synthetic rehearsal','2026-09-08','completed',100,200,?,?)",
);
for (const pain of [false, true])
  insert.run(
    `synthetic-${pain}`,
    'synthetic-a',
    JSON.stringify({
      energy: 3,
      recovery: pain ? 2 : 4,
      technique: 4,
      responses: [
        { id: 'pain-discomfort', label: 'Pain?', type: 'yes_no', value: pain },
        { id: 'session-rpe', label: 'Effort', type: 'scale', value: 8 },
      ],
    }),
    'Technique rating informed an uncertain synthetic note.',
  );
insert.run('synthetic-empty', 'synthetic-b', null, 'Unrelated original note.');
await db.backup(join(root, 'original.db'));
const options = {
  acknowledgement: 'I_ACKNOWLEDGE_SYNTHETIC_FIXTURE_ONLY',
  classifiedAt: '2026-09-08T00:00:00.000Z',
  batchSize: 1,
};
const original = db.serialize();
const dryRun = runFeedbackMigration(db, { ...options, mode: 'dry-run' });
if (!original.equals(db.serialize())) throw new Error('Dry-run modified fixture');
const applied = runFeedbackMigration(db, { ...options, mode: 'apply' });
const after = db.serialize();
const resumed = runFeedbackMigration(db, { ...options, mode: 'apply' });
if (!after.equals(db.serialize())) throw new Error('Resume modified fixture');
const restored = rollbackFeedbackMigration(db, options.acknowledgement);
const originalDb = new Database(join(root, 'original.db'), { readonly: true });
const native = 'SELECT * FROM workout_sessions ORDER BY id';
if (JSON.stringify(db.prepare(native).all()) !== JSON.stringify(originalDb.prepare(native).all()))
  throw new Error('Restoration changed source');
console.log(
  JSON.stringify(
    { path, dryRun, applied, resumed, restored, sourceRestorationExact: true },
    null,
    2,
  ),
);
originalDb.close();
db.close();
