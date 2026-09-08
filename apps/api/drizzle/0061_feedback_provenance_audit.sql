CREATE TABLE feedback_provenance_audit (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  source_checksum TEXT NOT NULL,
  source_version INTEGER NOT NULL,
  raw_payload TEXT NOT NULL,
  projected_payload TEXT NOT NULL,
  projected_checksum TEXT NOT NULL,
  classified_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY (user_id, session_id, source_checksum)
);
--> statement-breakpoint
CREATE TABLE feedback_submission_audit (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
 raw_payload TEXT NOT NULL,
 actor_kind TEXT NOT NULL,
 actor_id TEXT,
 received_at INTEGER NOT NULL,
 classification TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX feedback_submission_audit_owner_session_idx ON feedback_submission_audit(user_id,session_id);

--> statement-breakpoint
CREATE TABLE feedback_note_dispositions (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL,
 parent_id TEXT NOT NULL,
 source_id TEXT NOT NULL,
 field TEXT NOT NULL,
 source_key TEXT,
 note_checksum TEXT NOT NULL,
 raw_text TEXT NOT NULL,
 original_actor TEXT,
 original_timestamp INTEGER,
 state TEXT NOT NULL CHECK(state IN ('superseded','pending_review')),
 evidence_id TEXT,
 source_session_id TEXT,
 source_checksum TEXT,
 construct TEXT,
 reason TEXT NOT NULL,
 classified_at TEXT NOT NULL,
 rolled_back_at TEXT
);
--> statement-breakpoint
CREATE INDEX feedback_note_dispositions_owner_parent_idx ON feedback_note_dispositions(user_id,kind,parent_id);
--> statement-breakpoint
CREATE TABLE feedback_migration_ledger (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
 source_checksum TEXT NOT NULL,
 projected_checksum TEXT NOT NULL,
 source_version INTEGER NOT NULL,
 reason TEXT NOT NULL,
 source_evidence TEXT,
 classified_at TEXT NOT NULL,
 rolled_back_at TEXT,
 PRIMARY KEY(user_id,session_id)
);
