import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { hashSync } from 'bcryptjs';
import { migratePulseDatabase } from '../db/migrate.js';

const root = mkdtempSync(join(realpathSync(tmpdir()), 'pulse-feedback-synthetic-'));
const path = join(root, 'fixture.db');
const db = new Database(path);
db.pragma('foreign_keys = ON');
migratePulseDatabase(db, {
  migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
});
db.exec(
  "CREATE TABLE pulse_synthetic_fixture(purpose TEXT,version INTEGER); INSERT INTO pulse_synthetic_fixture VALUES('feedback-provenance-149',1)",
);
db.prepare('INSERT INTO users(id,username,password_hash,name,preferences) VALUES(?,?,?,?,?)').run(
  'synthetic-149',
  'synthetic149',
  hashSync('Synthetic149-only!', 10),
  'Synthetic Athlete',
  JSON.stringify({ timeZone: 'America/Detroit' }),
);
db.prepare(
  "INSERT INTO exercises(id,user_id,name,muscle_groups,equipment,category,tracking_type) VALUES(?,?,?,'[\"back\"]','dumbbell','compound','weight_reps')",
).run('synthetic-row', 'synthetic-149', 'Synthetic Dumbbell Row');
const startedAt = Date.now() - 30 * 60 * 1000;
for (const id of ['synthetic-session', 'synthetic-second-session']) {
  db.prepare(
    "INSERT INTO workout_sessions(id,user_id,name,date,status,started_at,time_segments,notes) VALUES(?,'synthetic-149','Synthetic Feedback Acceptance','2026-09-08','in-progress',?,'[]','Synthetic session note preserved.')",
  ).run(id, startedAt);
  for (const number of [1, 2])
    db.prepare(
      "INSERT INTO session_sets(id,session_id,exercise_id,set_number,weight,reps,rir,completed,section,notes) VALUES(?,?,'synthetic-row',?,20,8,0,1,'main','Native set note preserved.')",
    ).run(`${id}-set-${number}`, id, number);
}
await db.backup(join(root, 'original.db'));
db.close();
writeFileSync(
  fileURLToPath(
    new URL(
      '../../../../docs/implementation/feedback-provenance-evidence/fixture-location.txt',
      import.meta.url,
    ),
  ),
  path + '\n',
);
console.log('Synthetic fixture created:', path);
