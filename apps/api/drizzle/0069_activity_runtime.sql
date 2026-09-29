CREATE TABLE `activity_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `activity_goals_kind_check` CHECK(`kind` in ('conditioning','fat_loss','physical_therapy','mobility','fun','family','other')),
	CONSTRAINT `activity_goals_state_check` CHECK(`state` in ('active','paused','completed','archived')),
	CONSTRAINT `activity_goals_revision_check` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE INDEX `activity_goals_user_state_idx` ON `activity_goals` (`user_id`,`state`,`created_at`);
--> statement-breakpoint
CREATE TABLE `canonical_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`structured_workout_session_id` text REFERENCES `workout_sessions`(`id`) ON DELETE SET NULL,
	`source_json` text NOT NULL,
	`actor_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`current_revision_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `canonical_activities_kind_check` CHECK(`kind` in ('walking','running','stretching','yoga','cycling','swimming','hiking','physical_therapy','mobility','sport','other')),
	CONSTRAINT `canonical_activities_revision_check` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE INDEX `canonical_activities_user_created_idx` ON `canonical_activities` (`user_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `activity_goal_links` (
	`activity_id` text NOT NULL REFERENCES `canonical_activities`(`id`) ON DELETE CASCADE,
	`goal_id` text NOT NULL REFERENCES `activity_goals`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`created_at` text NOT NULL,
	PRIMARY KEY (`activity_id`,`goal_id`)
);
--> statement-breakpoint
CREATE INDEX `activity_goal_links_user_goal_idx` ON `activity_goal_links` (`user_id`,`goal_id`,`activity_id`);
--> statement-breakpoint
CREATE TABLE `activity_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL REFERENCES `canonical_activities`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`revision` integer NOT NULL,
	`prior_revision_id` text REFERENCES `activity_revisions`(`id`) ON DELETE CASCADE,
	`change_kind` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`corrected_fields_json` text,
	`reason` text,
	`actor_json` text NOT NULL,
	`created_at` text NOT NULL,
	UNIQUE(`activity_id`,`revision`),
	CONSTRAINT `activity_revisions_change_kind_check` CHECK(`change_kind` in ('created','correction','goal_links')),
	CONSTRAINT `activity_revisions_sequence_check` CHECK(`revision` >= 1 AND ((revision = 1 AND prior_revision_id IS NULL) OR (revision > 1 AND prior_revision_id IS NOT NULL)))
);
--> statement-breakpoint
CREATE INDEX `activity_revisions_user_activity_idx` ON `activity_revisions` (`user_id`,`activity_id`,`revision`);
--> statement-breakpoint
CREATE TABLE `activity_recurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL REFERENCES `canonical_activities`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`current_revision_id` text NOT NULL,
	`created_at` text NOT NULL,
	UNIQUE(`id`,`user_id`)
);
--> statement-breakpoint
CREATE INDEX `activity_recurrences_user_activity_idx` ON `activity_recurrences` (`user_id`,`activity_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `activity_recurrence_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`recurrence_id` text NOT NULL REFERENCES `activity_recurrences`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`sequence` integer NOT NULL,
	`prior_revision_id` text REFERENCES `activity_recurrence_revisions`(`id`) ON DELETE CASCADE,
	`effective_from_local_date` text NOT NULL,
	`time_zone` text NOT NULL,
	`frequency` text NOT NULL,
	`interval` integer NOT NULL,
	`weekdays_json` text NOT NULL,
	`assignment_policy` text NOT NULL,
	`actor_json` text NOT NULL,
	`created_at` text NOT NULL,
	UNIQUE(`recurrence_id`,`sequence`),
	CONSTRAINT `activity_recurrence_revisions_frequency_check` CHECK(`frequency` in ('daily','weekly','specific_weekdays')),
	CONSTRAINT `activity_recurrence_revisions_interval_check` CHECK(`interval` between 1 and 365),
	CONSTRAINT `activity_recurrence_revisions_policy_check` CHECK(`assignment_policy` = 'unassigned_on_or_after_effective_date'),
	CONSTRAINT `activity_recurrence_revisions_date_check` CHECK(`effective_from_local_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(`effective_from_local_date`, '+0 days') = `effective_from_local_date`),
	CONSTRAINT `activity_recurrence_revisions_sequence_check` CHECK(`sequence` >= 1 AND ((sequence = 1 AND prior_revision_id IS NULL) OR (sequence > 1 AND prior_revision_id IS NOT NULL)))
);
--> statement-breakpoint
CREATE INDEX `activity_recurrence_revisions_user_recurrence_idx` ON `activity_recurrence_revisions` (`user_id`,`recurrence_id`,`sequence`);
--> statement-breakpoint
CREATE TABLE `activity_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`activity_id` text NOT NULL REFERENCES `canonical_activities`(`id`) ON DELETE CASCADE,
	`recurrence_id` text REFERENCES `activity_recurrences`(`id`) ON DELETE CASCADE,
	`planned_local_date` text NOT NULL,
	`time_zone` text NOT NULL,
	`recurrence_revision_id` text REFERENCES `activity_recurrence_revisions`(`id`) ON DELETE RESTRICT,
	`revision` integer DEFAULT 1 NOT NULL,
	`current_revision_id` text NOT NULL,
	`state` text DEFAULT 'planned' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `activity_assignments_date_check` CHECK(`planned_local_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(`planned_local_date`, '+0 days') = `planned_local_date`),
	CONSTRAINT `activity_assignments_state_check` CHECK(`state` in ('planned','completed','skipped','cancelled')),
	CONSTRAINT `activity_assignments_revision_check` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_assignments_recurrence_occurrence_unique` ON `activity_assignments` (`recurrence_id`,`planned_local_date`) WHERE `recurrence_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `activity_assignments_user_date_idx` ON `activity_assignments` (`user_id`,`planned_local_date`,`id`);
--> statement-breakpoint
CREATE INDEX `activity_assignments_user_activity_idx` ON `activity_assignments` (`user_id`,`activity_id`,`planned_local_date`);
--> statement-breakpoint
CREATE TABLE `activity_assignment_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL REFERENCES `activity_assignments`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`revision` integer NOT NULL,
	`prior_revision_id` text REFERENCES `activity_assignment_revisions`(`id`) ON DELETE CASCADE,
	`planned_local_date` text NOT NULL,
	`time_zone` text NOT NULL,
	`recurrence_revision_id` text REFERENCES `activity_recurrence_revisions`(`id`) ON DELETE RESTRICT,
	`state` text NOT NULL,
	`reason` text,
	`actor_json` text NOT NULL,
	`created_at` text NOT NULL,
	UNIQUE(`assignment_id`,`revision`),
	CONSTRAINT `activity_assignment_revisions_date_check` CHECK(`planned_local_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(`planned_local_date`, '+0 days') = `planned_local_date`),
	CONSTRAINT `activity_assignment_revisions_state_check` CHECK(`state` in ('planned','completed','skipped','cancelled')),
	CONSTRAINT `activity_assignment_revisions_sequence_check` CHECK(`revision` >= 1 AND ((revision = 1 AND prior_revision_id IS NULL) OR (revision > 1 AND prior_revision_id IS NOT NULL)))
);
--> statement-breakpoint
CREATE INDEX `activity_assignment_revisions_user_assignment_idx` ON `activity_assignment_revisions` (`user_id`,`assignment_id`,`revision`);
--> statement-breakpoint
CREATE TABLE `activity_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`activity_id` text NOT NULL REFERENCES `canonical_activities`(`id`) ON DELETE CASCADE,
	`assignment_id` text REFERENCES `activity_assignments`(`id`) ON DELETE RESTRICT,
	`actual_occurred_at` text NOT NULL,
	`actual_local_date` text NOT NULL,
	`time_zone` text NOT NULL,
	`duration_minutes` integer,
	`outcome` text NOT NULL,
	`structured_workout_session_id` text REFERENCES `workout_sessions`(`id`) ON DELETE SET NULL,
	`source_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`current_revision_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `activity_executions_date_check` CHECK(`actual_local_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(`actual_local_date`, '+0 days') = `actual_local_date`),
	CONSTRAINT `activity_executions_duration_check` CHECK(`duration_minutes` IS NULL OR `duration_minutes` > 0),
	CONSTRAINT `activity_executions_outcome_check` CHECK(`outcome` in ('completed','partial','skipped','unknown')),
	CONSTRAINT `activity_executions_revision_check` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_executions_assignment_unique` ON `activity_executions` (`assignment_id`) WHERE `assignment_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `activity_executions_user_date_idx` ON `activity_executions` (`user_id`,`actual_local_date`,`id`);
--> statement-breakpoint
CREATE INDEX `activity_executions_user_activity_idx` ON `activity_executions` (`user_id`,`activity_id`,`actual_occurred_at`);
--> statement-breakpoint
CREATE TABLE `activity_execution_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL REFERENCES `activity_executions`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`revision` integer NOT NULL,
	`prior_revision_id` text REFERENCES `activity_execution_revisions`(`id`) ON DELETE CASCADE,
	`snapshot_json` text NOT NULL,
	`corrected_fields_json` text,
	`reason` text,
	`actor_json` text NOT NULL,
	`created_at` text NOT NULL,
	UNIQUE(`execution_id`,`revision`),
	CONSTRAINT `activity_execution_revisions_sequence_check` CHECK(`revision` >= 1 AND ((revision = 1 AND prior_revision_id IS NULL) OR (revision > 1 AND prior_revision_id IS NOT NULL)))
);
--> statement-breakpoint
CREATE INDEX `activity_execution_revisions_user_execution_idx` ON `activity_execution_revisions` (`user_id`,`execution_id`,`revision`);
--> statement-breakpoint
CREATE TABLE `activity_owned_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`activity_id` text NOT NULL REFERENCES `canonical_activities`(`id`) ON DELETE CASCADE,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`target_revision_id` text,
	`relation` text NOT NULL,
	`created_at` text NOT NULL,
	UNIQUE(`activity_id`,`target_kind`,`target_id`,`relation`),
	CONSTRAINT `activity_owned_links_target_kind_check` CHECK(`target_kind` in ('activity','workout_session','scheduled_workout')),
	CONSTRAINT `activity_owned_links_relation_check` CHECK(`relation` in ('structured_workout_reference','observed_during'))
);
--> statement-breakpoint
CREATE INDEX `activity_owned_links_user_target_idx` ON `activity_owned_links` (`user_id`,`target_kind`,`target_id`);
--> statement-breakpoint
CREATE TABLE `activity_idempotency_receipts` (
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
	UNIQUE(`user_id`,`route`,`operation`,`idempotency_key`),
	CONSTRAINT `activity_idempotency_receipts_actor_kind_check` CHECK(`actor_kind` in ('user','agent_token','system')),
	CONSTRAINT `activity_idempotency_receipts_status_check` CHECK(`status_code` between 200 and 299),
	CONSTRAINT `activity_idempotency_receipts_hash_check` CHECK(length(`request_fingerprint`) = 64)
);
--> statement-breakpoint
CREATE INDEX `activity_idempotency_receipts_user_created_idx` ON `activity_idempotency_receipts` (`user_id`,`created_at`);
