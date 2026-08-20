CREATE TABLE `adaptive_nutrition_review_contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`program_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject` text NOT NULL,
	`category` text NOT NULL,
	`note` text NOT NULL,
	`resolution` text,
	`created_by` text NOT NULL,
	`agent_token_id` text,
	`actor_label` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `adaptive_nutrition_programs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_review_contexts_program_user_fk` FOREIGN KEY (`program_id`,`user_id`) REFERENCES `adaptive_nutrition_programs`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_review_contexts_subject_type_check` CHECK(`subject_type` in ('date', 'date_range', 'nutrition_log', 'weigh_in', 'scheduled_workout', 'workout_session', 'check_in', 'upcoming_check_in')),
	CONSTRAINT `adaptive_nutrition_review_contexts_subject_json_check` CHECK(json_valid(`subject`) and json_type(`subject`) = 'object' and json_extract(`subject`, '$.kind') = `subject_type`),
	CONSTRAINT `adaptive_nutrition_review_contexts_category_check` CHECK(`category` in ('illness', 'recovery', 'pain_injury', 'travel', 'nutrition_exception', 'training_change', 'schedule_change', 'clarification', 'other')),
	CONSTRAINT `adaptive_nutrition_review_contexts_note_check` CHECK(length(trim(`note`)) between 1 and 4000),
	CONSTRAINT `adaptive_nutrition_review_contexts_resolution_check` CHECK(`resolution` is null or length(trim(`resolution`)) between 1 and 4000),
	CONSTRAINT `adaptive_nutrition_review_contexts_actor_check` CHECK((`created_by` = 'user' and `agent_token_id` is null) or (`created_by` = 'agent_token' and `agent_token_id` is not null)),
	CONSTRAINT `adaptive_nutrition_review_contexts_revision_check` CHECK(`revision` >= 1),
	CONSTRAINT `adaptive_nutrition_review_contexts_timestamps_check` CHECK(`created_at` > 0 and `updated_at` >= `created_at` and (`deleted_at` is null or `deleted_at` >= `created_at`))
);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_review_contexts_user_updated_idx` ON `adaptive_nutrition_review_contexts` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_review_contexts_program_active_idx` ON `adaptive_nutrition_review_contexts` (`program_id`,`deleted_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_review_contexts_id_user_unique` ON `adaptive_nutrition_review_contexts` (`id`,`user_id`);
--> statement-breakpoint
CREATE TABLE `adaptive_nutrition_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`program_id` text NOT NULL,
	`check_in_id` text NOT NULL,
	`kind` text NOT NULL,
	`review_version` integer DEFAULT 1 NOT NULL,
	`source_fingerprint` text NOT NULL,
	`review_local_date` text NOT NULL,
	`analysis_start` text NOT NULL,
	`analysis_end` text NOT NULL,
	`time_zone` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `adaptive_nutrition_programs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`check_in_id`) REFERENCES `adaptive_nutrition_checkins`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `adaptive_nutrition_reviews_program_user_fk` FOREIGN KEY (`program_id`,`user_id`) REFERENCES `adaptive_nutrition_programs`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_reviews_check_in_user_fk` FOREIGN KEY (`check_in_id`,`user_id`) REFERENCES `adaptive_nutrition_checkins`(`id`,`user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `adaptive_nutrition_reviews_kind_check` CHECK(`kind` in ('weekly', 'manual')),
	CONSTRAINT `adaptive_nutrition_reviews_version_check` CHECK(`review_version` = 1),
	CONSTRAINT `adaptive_nutrition_reviews_fingerprint_check` CHECK(length(`source_fingerprint`) = 64 and `source_fingerprint` not glob '*[^0-9a-f]*'),
	CONSTRAINT `adaptive_nutrition_reviews_dates_check` CHECK(`review_local_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and `analysis_start` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and `analysis_end` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and `analysis_start` <= `analysis_end`),
	CONSTRAINT `adaptive_nutrition_reviews_snapshot_check` CHECK(json_valid(`snapshot`) and json_type(`snapshot`) = 'object'),
	CONSTRAINT `adaptive_nutrition_reviews_created_at_check` CHECK(`created_at` > 0)
);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_reviews_user_created_idx` ON `adaptive_nutrition_reviews` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_reviews_program_date_idx` ON `adaptive_nutrition_reviews` (`program_id`,`review_local_date`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_reviews_generation_unique` ON `adaptive_nutrition_reviews` (`program_id`,`kind`,`analysis_end`,`source_fingerprint`,`review_version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_reviews_id_user_unique` ON `adaptive_nutrition_reviews` (`id`,`user_id`);
--> statement-breakpoint
CREATE TABLE `adaptive_nutrition_review_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`user_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`actor_type` text NOT NULL,
	`agent_token_id` text,
	`actor_label` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `adaptive_nutrition_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_review_actions_review_user_fk` FOREIGN KEY (`review_id`,`user_id`) REFERENCES `adaptive_nutrition_reviews`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_review_actions_sequence_check` CHECK(`sequence` >= 1),
	CONSTRAINT `adaptive_nutrition_review_actions_type_check` CHECK(`type` in ('accept', 'edit', 'defer', 'decline', 'ask_agent', 'answer', 'supersede')),
	CONSTRAINT `adaptive_nutrition_review_actions_payload_check` CHECK(json_valid(`payload`) and json_type(`payload`) = 'object'),
	CONSTRAINT `adaptive_nutrition_review_actions_actor_check` CHECK((`actor_type` in ('user', 'system') and `agent_token_id` is null) or (`actor_type` = 'agent_token' and `agent_token_id` is not null)),
	CONSTRAINT `adaptive_nutrition_review_actions_created_at_check` CHECK(`created_at` > 0)
);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_review_actions_user_created_idx` ON `adaptive_nutrition_review_actions` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_review_actions_review_sequence_unique` ON `adaptive_nutrition_review_actions` (`review_id`,`sequence`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_review_actions_id_user_unique` ON `adaptive_nutrition_review_actions` (`id`,`user_id`);
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_review_contexts_update_guard`
BEFORE UPDATE ON `adaptive_nutrition_review_contexts`
WHEN NEW.`id` <> OLD.`id`
	OR NEW.`user_id` <> OLD.`user_id`
	OR NEW.`program_id` <> OLD.`program_id`
	OR NEW.`subject_type` <> OLD.`subject_type`
	OR NEW.`subject` <> OLD.`subject`
	OR NEW.`created_by` <> OLD.`created_by`
	OR coalesce(NEW.`agent_token_id`, '') <> coalesce(OLD.`agent_token_id`, '')
	OR NEW.`actor_label` <> OLD.`actor_label`
	OR NEW.`created_at` <> OLD.`created_at`
	OR NEW.`revision` <> OLD.`revision` + 1
	OR OLD.`deleted_at` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition review context update violates revision history');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_review_contexts_delete_guard`
BEFORE DELETE ON `adaptive_nutrition_review_contexts`
WHEN NOT EXISTS (
	SELECT 1 FROM `adaptive_nutrition_account_deletion_scope` AS `scope`
	WHERE `scope`.`user_id` = OLD.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition review contexts may only be deleted in account deletion scope');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_reviews_update_guard`
BEFORE UPDATE ON `adaptive_nutrition_reviews`
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition reviews are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_reviews_delete_guard`
BEFORE DELETE ON `adaptive_nutrition_reviews`
WHEN NOT EXISTS (
	SELECT 1 FROM `adaptive_nutrition_account_deletion_scope` AS `scope`
	WHERE `scope`.`user_id` = OLD.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition reviews may only be deleted in account deletion scope');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_review_actions_insert_sequence_guard`
BEFORE INSERT ON `adaptive_nutrition_review_actions`
WHEN NEW.`sequence` <> coalesce((
	SELECT max(`action`.`sequence`) + 1
	FROM `adaptive_nutrition_review_actions` AS `action`
	WHERE `action`.`review_id` = NEW.`review_id`
), 1)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition review actions require the exact next sequence');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_review_actions_insert_terminal_guard`
BEFORE INSERT ON `adaptive_nutrition_review_actions`
WHEN EXISTS (
	SELECT 1 FROM `adaptive_nutrition_review_actions` AS `action`
	WHERE `action`.`review_id` = NEW.`review_id`
		AND `action`.`type` IN ('accept', 'decline', 'supersede')
)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition review is already terminal');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_review_actions_update_guard`
BEFORE UPDATE ON `adaptive_nutrition_review_actions`
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition review actions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_review_actions_delete_guard`
BEFORE DELETE ON `adaptive_nutrition_review_actions`
WHEN NOT EXISTS (
	SELECT 1 FROM `adaptive_nutrition_account_deletion_scope` AS `scope`
	WHERE `scope`.`user_id` = OLD.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition review actions may only be deleted in account deletion scope');
END;
