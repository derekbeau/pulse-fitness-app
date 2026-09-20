CREATE TABLE `daily_check_in_questions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `local_date` text NOT NULL,
  `time_zone` text NOT NULL,
  `deduplication_key` text NOT NULL,
  `semantic_topic` text NOT NULL,
  `prompt` text NOT NULL,
  `state` text NOT NULL DEFAULT 'pending',
  `source_references_json` text NOT NULL,
  `follow_up_question_id` text REFERENCES `daily_check_in_questions`(`id`) ON DELETE RESTRICT,
  `revision` integer NOT NULL DEFAULT 1,
  `current_revision_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  UNIQUE(`user_id`,`deduplication_key`),
  CONSTRAINT `daily_check_in_questions_state_check` CHECK(`state` in ('pending','answered','retired')),
  CONSTRAINT `daily_check_in_questions_revision_check` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE INDEX `daily_check_in_questions_user_day_state_idx` ON `daily_check_in_questions` (`user_id`,`local_date`,`state`,`created_at`);
--> statement-breakpoint
CREATE TABLE `daily_check_in_question_revisions` (
  `id` text PRIMARY KEY NOT NULL,
  `question_id` text NOT NULL REFERENCES `daily_check_in_questions`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `revision` integer NOT NULL,
  `prior_revision_id` text REFERENCES `daily_check_in_question_revisions`(`id`) ON DELETE RESTRICT,
  `snapshot_json` text NOT NULL,
  `actor_json` text NOT NULL,
  `created_at` text NOT NULL,
  UNIQUE(`question_id`,`revision`),
  CONSTRAINT `daily_check_in_question_revisions_sequence_check` CHECK(`revision` >= 1 AND ((revision = 1 AND prior_revision_id IS NULL) OR (revision > 1 AND prior_revision_id IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE `daily_check_in_answers` (
  `id` text PRIMARY KEY NOT NULL,
  `question_id` text NOT NULL REFERENCES `daily_check_in_questions`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `state` text NOT NULL,
  `value` text,
  `source_json` text NOT NULL,
  `answered_at` text NOT NULL,
  `revision` integer NOT NULL DEFAULT 1,
  `current_revision_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  UNIQUE(`question_id`),
  CONSTRAINT `daily_check_in_answers_state_check` CHECK(`state` in ('answered','unknown','skipped')),
  CONSTRAINT `daily_check_in_answers_value_check` CHECK((`state` = 'answered' AND `value` IS NOT NULL) OR (`state` != 'answered' AND `value` IS NULL))
);
--> statement-breakpoint
CREATE TABLE `daily_check_in_answer_revisions` (
  `id` text PRIMARY KEY NOT NULL,
  `answer_id` text NOT NULL REFERENCES `daily_check_in_answers`(`id`) ON DELETE CASCADE,
  `question_id` text NOT NULL REFERENCES `daily_check_in_questions`(`id`) ON DELETE CASCADE,
  `question_revision_id` text NOT NULL REFERENCES `daily_check_in_question_revisions`(`id`) ON DELETE RESTRICT,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `revision` integer NOT NULL,
  `prior_revision_id` text REFERENCES `daily_check_in_answer_revisions`(`id`) ON DELETE RESTRICT,
  `state` text NOT NULL,
  `value` text,
  `source_json` text NOT NULL,
  `answered_at` text NOT NULL,
  `reason` text,
  `actor_json` text NOT NULL,
  `created_at` text NOT NULL,
  UNIQUE(`answer_id`,`revision`),
  CONSTRAINT `daily_check_in_answer_revisions_sequence_check` CHECK(`revision` >= 1 AND ((revision = 1 AND prior_revision_id IS NULL) OR (revision > 1 AND prior_revision_id IS NOT NULL))),
  CONSTRAINT `daily_check_in_answer_revisions_state_check` CHECK(`state` in ('answered','unknown','skipped')),
  CONSTRAINT `daily_check_in_answer_revisions_value_check` CHECK((`state` = 'answered' AND `value` IS NOT NULL) OR (`state` != 'answered' AND `value` IS NULL))
);
--> statement-breakpoint
CREATE INDEX `daily_check_in_answer_revisions_user_question_idx` ON `daily_check_in_answer_revisions` (`user_id`,`question_id`,`revision`);
--> statement-breakpoint
CREATE TABLE `daily_check_in_idempotency_receipts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `actor_kind` text NOT NULL,
  `actor_id` text NOT NULL,
  `route` text NOT NULL,
  `operation` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_fingerprint` text NOT NULL,
  `status_code` integer NOT NULL,
  `response_json` text NOT NULL,
  `created_at` text NOT NULL,
  UNIQUE(`user_id`,`route`,`operation`,`idempotency_key`)
);
