CREATE TABLE workout_feedback_planning_decisions (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 concern_ref TEXT NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence > 0),
 prior_decision_id TEXT REFERENCES workout_feedback_planning_decisions(id) ON DELETE CASCADE,
 source_session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
 source_exercise_id TEXT NOT NULL,
 source_section TEXT NOT NULL CHECK(source_section IN ('warmup','main','cooldown','supplemental')),
 source_text TEXT NOT NULL,
 source_text_hash TEXT NOT NULL,
 source_timestamp INTEGER NOT NULL,
 source_classification TEXT NOT NULL CHECK(source_classification IN ('programming_precaution','clinician_authored_guidance')),
 disposition TEXT NOT NULL CHECK(disposition IN ('retain','revise','retire')),
 interpretation TEXT NOT NULL,
 reason TEXT NOT NULL,
 actor_type TEXT NOT NULL CHECK(actor_type = 'agent_token'),
 actor_id TEXT NOT NULL,
 actor_label TEXT NOT NULL,
 dependencies TEXT NOT NULL CHECK(json_valid(dependencies) AND json_type(dependencies) = 'array'),
 dependency_fingerprint TEXT NOT NULL,
 input TEXT NOT NULL CHECK(json_valid(input) AND json_type(input) = 'object'),
 target_mutations TEXT NOT NULL CHECK(json_valid(target_mutations) AND json_type(target_mutations) = 'array'),
 idempotency_key TEXT NOT NULL,
 request_fingerprint TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(user_id,concern_ref,sequence),
 UNIQUE(user_id,idempotency_key),
 CHECK(length(source_text_hash) = 64 AND source_text_hash NOT GLOB '*[^0-9a-f]*'),
 CHECK(length(dependency_fingerprint) = 64 AND dependency_fingerprint NOT GLOB '*[^0-9a-f]*'),
 CHECK(length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE INDEX workout_feedback_planning_decisions_owner_created_idx ON workout_feedback_planning_decisions(user_id,created_at);
--> statement-breakpoint
CREATE TABLE workout_feedback_planning_decision_responses (
 decision_id TEXT NOT NULL REFERENCES workout_feedback_planning_decisions(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 response_revision_id TEXT NOT NULL REFERENCES workout_feedback_answer_revisions(id) ON DELETE CASCADE,
 UNIQUE(decision_id,response_revision_id)
);
--> statement-breakpoint
CREATE INDEX workout_feedback_planning_decision_responses_owner_idx ON workout_feedback_planning_decision_responses(user_id);
--> statement-breakpoint
CREATE TRIGGER workout_feedback_planning_decisions_owner_insert BEFORE INSERT ON workout_feedback_planning_decisions
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM workout_sessions
  WHERE id=NEW.source_session_id AND user_id=NEW.user_id
 ) THEN RAISE(ABORT,'invalid feedback planning decision owner') END;
 SELECT CASE WHEN
  (NEW.sequence=1 AND NEW.prior_decision_id IS NOT NULL) OR
  (NEW.sequence>1 AND NOT EXISTS(
   SELECT 1 FROM workout_feedback_planning_decisions
   WHERE id=NEW.prior_decision_id AND user_id=NEW.user_id AND concern_ref=NEW.concern_ref AND sequence=NEW.sequence-1
  ))
 THEN RAISE(ABORT,'invalid feedback planning decision order') END;
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_planning_decisions_immutable BEFORE UPDATE ON workout_feedback_planning_decisions
BEGIN
 SELECT RAISE(ABORT,'feedback planning decisions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_planning_decision_responses_owner_insert BEFORE INSERT ON workout_feedback_planning_decision_responses
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM workout_feedback_planning_decisions
  WHERE id=NEW.decision_id AND user_id=NEW.user_id
 ) OR NOT EXISTS(
  SELECT 1 FROM workout_feedback_answer_revisions
  WHERE id=NEW.response_revision_id AND user_id=NEW.user_id
 ) THEN RAISE(ABORT,'invalid feedback planning response owner') END;
END;
--> statement-breakpoint
CREATE TRIGGER workout_feedback_planning_response_purge AFTER DELETE ON workout_feedback_planning_decision_responses
BEGIN
 DELETE FROM workout_feedback_planning_decisions WHERE id=OLD.decision_id;
END;
