CREATE TABLE workout_feedback_question_lists (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scope_kind TEXT NOT NULL CHECK(scope_kind IN ('template','scheduled','session')),
 scope_id TEXT NOT NULL,
 current_revision INTEGER NOT NULL CHECK(current_revision >= 0),
 source TEXT NOT NULL CHECK(source IN ('system_core','template_defaults','template_snapshot','scheduled_override','ad_hoc','legacy_import')),
 updated_at INTEGER NOT NULL,
 UNIQUE(user_id,scope_kind,scope_id)
);
--> statement-breakpoint
CREATE INDEX workout_feedback_question_lists_owner_scope_idx ON workout_feedback_question_lists(user_id,scope_kind,scope_id);
--> statement-breakpoint
CREATE TABLE workout_feedback_question_list_revisions (
 id TEXT PRIMARY KEY NOT NULL,
 list_id TEXT NOT NULL REFERENCES workout_feedback_question_lists(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision > 0),
 prior_revision_id TEXT,
 source TEXT NOT NULL CHECK(source IN ('system_core','template_defaults','template_snapshot','scheduled_override','ad_hoc','legacy_import')),
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('system','user','agent_token','legacy_import')),
 actor_id TEXT,
 actor_name TEXT,
 created_at INTEGER NOT NULL,
 UNIQUE(list_id,revision),
 FOREIGN KEY(prior_revision_id) REFERENCES workout_feedback_question_list_revisions(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX workout_feedback_question_list_revisions_owner_idx ON workout_feedback_question_list_revisions(user_id,list_id);
--> statement-breakpoint
CREATE TABLE workout_feedback_question_definitions (
 id TEXT PRIMARY KEY NOT NULL,
 list_revision_id TEXT NOT NULL REFERENCES workout_feedback_question_list_revisions(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 question_id TEXT NOT NULL,
 definition_version INTEGER NOT NULL CHECK(definition_version > 0),
 order_index INTEGER NOT NULL CHECK(order_index >= 0),
 prompt TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('scale','slider','text','yes_no','emoji','multi_select')),
 timing TEXT NOT NULL CHECK(timing IN ('post_session','next_check_in')),
 definition TEXT NOT NULL CHECK(json_valid(definition)),
 UNIQUE(list_revision_id,question_id),
 UNIQUE(list_revision_id,order_index)
);
--> statement-breakpoint
CREATE INDEX workout_feedback_question_definitions_owner_question_idx ON workout_feedback_question_definitions(user_id,question_id,definition_version);
--> statement-breakpoint
CREATE TABLE workout_feedback_answer_sets (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
 current_revision INTEGER NOT NULL DEFAULT 0 CHECK(current_revision >= 0),
 updated_at INTEGER NOT NULL,
 UNIQUE(user_id,session_id)
);
--> statement-breakpoint
CREATE TABLE workout_feedback_answer_revisions (
 id TEXT PRIMARY KEY NOT NULL,
 answer_set_id TEXT NOT NULL REFERENCES workout_feedback_answer_sets(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
 response_id TEXT NOT NULL,
 question_id TEXT NOT NULL,
 definition_version INTEGER NOT NULL CHECK(definition_version > 0),
 revision INTEGER NOT NULL CHECK(revision > 0),
 prior_revision_id TEXT REFERENCES workout_feedback_answer_revisions(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('answered','skipped','unanswered','unknown')),
 timing TEXT NOT NULL CHECK(timing IN ('post_session','next_check_in')),
 answer TEXT NOT NULL CHECK(json_valid(answer)),
 answered_at TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(answer_set_id,question_id,definition_version,revision)
);
--> statement-breakpoint
CREATE INDEX workout_feedback_answer_revisions_owner_session_idx ON workout_feedback_answer_revisions(user_id,session_id);
--> statement-breakpoint
CREATE TABLE workout_feedback_answer_current (
 answer_set_id TEXT NOT NULL REFERENCES workout_feedback_answer_sets(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
 question_id TEXT NOT NULL,
 definition_version INTEGER NOT NULL CHECK(definition_version > 0),
 response_revision_id TEXT NOT NULL UNIQUE REFERENCES workout_feedback_answer_revisions(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision > 0),
 PRIMARY KEY(answer_set_id,question_id,definition_version)
);
--> statement-breakpoint
CREATE INDEX workout_feedback_answer_current_owner_session_idx ON workout_feedback_answer_current(user_id,session_id);
--> statement-breakpoint
CREATE TRIGGER workout_feedback_question_lists_owner_insert BEFORE INSERT ON workout_feedback_question_lists
BEGIN
 SELECT CASE WHEN
  (NEW.scope_kind='template' AND NOT EXISTS(SELECT 1 FROM workout_templates WHERE id=NEW.scope_id AND user_id=NEW.user_id)) OR
  (NEW.scope_kind='scheduled' AND NOT EXISTS(SELECT 1 FROM scheduled_workouts WHERE id=NEW.scope_id AND user_id=NEW.user_id)) OR
  (NEW.scope_kind='session' AND NOT EXISTS(SELECT 1 FROM workout_sessions WHERE id=NEW.scope_id AND user_id=NEW.user_id))
 THEN RAISE(ABORT,'invalid workout feedback question list owner') END;
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_question_lists_owner_update BEFORE UPDATE ON workout_feedback_question_lists
BEGIN
 SELECT CASE WHEN
  (NEW.scope_kind='template' AND NOT EXISTS(SELECT 1 FROM workout_templates WHERE id=NEW.scope_id AND user_id=NEW.user_id)) OR
  (NEW.scope_kind='scheduled' AND NOT EXISTS(SELECT 1 FROM scheduled_workouts WHERE id=NEW.scope_id AND user_id=NEW.user_id)) OR
  (NEW.scope_kind='session' AND NOT EXISTS(SELECT 1 FROM workout_sessions WHERE id=NEW.scope_id AND user_id=NEW.user_id))
 THEN RAISE(ABORT,'invalid workout feedback question list owner') END;
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_question_revisions_owner_insert BEFORE INSERT ON workout_feedback_question_list_revisions
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM workout_feedback_question_lists WHERE id=NEW.list_id AND user_id=NEW.user_id)
 THEN RAISE(ABORT,'invalid workout feedback question revision owner') END;
 SELECT CASE WHEN
  (NEW.revision=1 AND NEW.prior_revision_id IS NOT NULL) OR
  (NEW.revision>1 AND NOT EXISTS(SELECT 1 FROM workout_feedback_question_list_revisions WHERE id=NEW.prior_revision_id AND list_id=NEW.list_id AND user_id=NEW.user_id AND revision=NEW.revision-1))
 THEN RAISE(ABORT,'invalid workout feedback question revision order') END;
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_question_revisions_immutable BEFORE UPDATE ON workout_feedback_question_list_revisions
BEGIN
 SELECT RAISE(ABORT,'workout feedback question revisions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_question_definitions_owner_insert BEFORE INSERT ON workout_feedback_question_definitions
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM workout_feedback_question_list_revisions WHERE id=NEW.list_revision_id AND user_id=NEW.user_id)
 THEN RAISE(ABORT,'invalid workout feedback question definition owner') END;
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_question_definitions_immutable BEFORE UPDATE ON workout_feedback_question_definitions
BEGIN
 SELECT RAISE(ABORT,'workout feedback question definitions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_answer_sets_owner_insert BEFORE INSERT ON workout_feedback_answer_sets
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM workout_sessions WHERE id=NEW.session_id AND user_id=NEW.user_id)
 THEN RAISE(ABORT,'invalid workout feedback answer owner') END;
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_answer_sets_owner_update BEFORE UPDATE ON workout_feedback_answer_sets
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM workout_sessions WHERE id=NEW.session_id AND user_id=NEW.user_id)
 THEN RAISE(ABORT,'invalid workout feedback answer owner') END;
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_answer_revisions_owner_insert BEFORE INSERT ON workout_feedback_answer_revisions
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM workout_feedback_answer_sets WHERE id=NEW.answer_set_id AND session_id=NEW.session_id AND user_id=NEW.user_id)
 THEN RAISE(ABORT,'invalid workout feedback answer revision owner') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM workout_feedback_question_definitions d
  JOIN workout_feedback_question_list_revisions r ON r.id=d.list_revision_id
  JOIN workout_feedback_question_lists l ON l.id=r.list_id AND l.current_revision=r.revision
  WHERE l.user_id=NEW.user_id AND l.scope_kind='session' AND l.scope_id=NEW.session_id
   AND d.question_id=NEW.question_id AND d.definition_version=NEW.definition_version
 ) THEN RAISE(ABORT,'invalid workout feedback answer definition') END;
 SELECT CASE WHEN
  (NEW.revision=1 AND NEW.prior_revision_id IS NOT NULL) OR
  (NEW.revision>1 AND NOT EXISTS(SELECT 1 FROM workout_feedback_answer_revisions WHERE id=NEW.prior_revision_id AND answer_set_id=NEW.answer_set_id AND user_id=NEW.user_id AND session_id=NEW.session_id AND question_id=NEW.question_id AND definition_version=NEW.definition_version AND response_id=NEW.response_id AND revision=NEW.revision-1))
 THEN RAISE(ABORT,'invalid workout feedback answer revision order') END;
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_answer_revisions_immutable BEFORE UPDATE ON workout_feedback_answer_revisions
BEGIN
 SELECT RAISE(ABORT,'workout feedback answer revisions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_answer_current_owner_insert BEFORE INSERT ON workout_feedback_answer_current
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM workout_feedback_answer_revisions WHERE id=NEW.response_revision_id AND answer_set_id=NEW.answer_set_id AND session_id=NEW.session_id AND user_id=NEW.user_id AND question_id=NEW.question_id AND definition_version=NEW.definition_version AND revision=NEW.revision)
 THEN RAISE(ABORT,'invalid workout feedback current answer') END;
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_answer_current_owner_update BEFORE UPDATE ON workout_feedback_answer_current
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM workout_feedback_answer_revisions WHERE id=NEW.response_revision_id AND answer_set_id=NEW.answer_set_id AND session_id=NEW.session_id AND user_id=NEW.user_id AND question_id=NEW.question_id AND definition_version=NEW.definition_version AND revision=NEW.revision)
 THEN RAISE(ABORT,'invalid workout feedback current answer') END;
END;
