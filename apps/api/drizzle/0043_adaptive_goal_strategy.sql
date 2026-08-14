CREATE TABLE `adaptive_nutrition_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`program_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`start_trend_weight_kg` real NOT NULL,
	`start_scale_weight_kg` real,
	`target_weight_kg` real,
	`maintenance_center_kg` real,
	`goal_rate_pct_per_week` real NOT NULL,
	`started_local_date` text NOT NULL,
	`ended_local_date` text,
	`ended_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `adaptive_nutrition_programs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`,`user_id`) REFERENCES `adaptive_nutrition_programs`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_goals_type_check` CHECK(`type` in ('lose', 'maintain', 'gain')),
	CONSTRAINT `adaptive_nutrition_goals_status_check` CHECK(`status` in ('active', 'completed', 'replaced', 'cancelled')),
	CONSTRAINT `adaptive_nutrition_goals_weight_bounds_check` CHECK(`start_trend_weight_kg` between 25 and 350 and (`start_scale_weight_kg` is null or `start_scale_weight_kg` between 25 and 350) and (`target_weight_kg` is null or `target_weight_kg` between 25 and 350) and (`maintenance_center_kg` is null or `maintenance_center_kg` between 25 and 350)),
	CONSTRAINT `adaptive_nutrition_goals_strategy_check` CHECK((`type` = 'lose' and `target_weight_kg` is not null and `maintenance_center_kg` is null and `goal_rate_pct_per_week` between -1 and -0.1) or (`type` = 'gain' and `target_weight_kg` is not null and `maintenance_center_kg` is null and `goal_rate_pct_per_week` between 0.1 and 0.5) or (`type` = 'maintain' and `target_weight_kg` is null and `maintenance_center_kg` is not null and `goal_rate_pct_per_week` = 0)),
	CONSTRAINT `adaptive_nutrition_goals_dates_check` CHECK(`started_local_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and (`ended_local_date` is null or `ended_local_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
	CONSTRAINT `adaptive_nutrition_goals_lifecycle_check` CHECK((`status` = 'active' and `ended_local_date` is null and `ended_reason` is null) or (`status` = 'completed' and `ended_local_date` is not null and `ended_reason` = 'completed') or (`status` = 'replaced' and `ended_local_date` is not null and `ended_reason` = 'direction_changed') or (`status` = 'cancelled' and `ended_local_date` is not null and `ended_reason` = 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_goals_user_id_idx` ON `adaptive_nutrition_goals` (`user_id`);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_goals_program_id_idx` ON `adaptive_nutrition_goals` (`program_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_goals_id_user_id_unique` ON `adaptive_nutrition_goals` (`id`,`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_goals_one_active_per_user_unique` ON `adaptive_nutrition_goals` (`user_id`) WHERE `status` = 'active';
--> statement-breakpoint
CREATE TABLE `adaptive_nutrition_goal_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`target_weight_kg` real,
	`maintenance_center_kg` real,
	`goal_rate_pct_per_week` real NOT NULL,
	`previous_target_weight_kg` real,
	`previous_center_kg` real,
	`previous_rate_pct_per_week` real NOT NULL,
	`reason` text NOT NULL,
	`effective_local_date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `adaptive_nutrition_goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`,`user_id`) REFERENCES `adaptive_nutrition_goals`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_goal_revisions_sequence_check` CHECK(`sequence` >= 1),
	CONSTRAINT `adaptive_nutrition_goal_revisions_weights_check` CHECK((`target_weight_kg` is null or `target_weight_kg` between 25 and 350) and (`maintenance_center_kg` is null or `maintenance_center_kg` between 25 and 350) and (`previous_target_weight_kg` is null or `previous_target_weight_kg` between 25 and 350) and (`previous_center_kg` is null or `previous_center_kg` between 25 and 350)),
	CONSTRAINT `adaptive_nutrition_goal_revisions_strategy_check` CHECK((`target_weight_kg` is not null and `maintenance_center_kg` is null and (`goal_rate_pct_per_week` between -1 and -0.1 or `goal_rate_pct_per_week` between 0.1 and 0.5)) or (`target_weight_kg` is null and `maintenance_center_kg` is not null and `goal_rate_pct_per_week` = 0)),
	CONSTRAINT `adaptive_nutrition_goal_revisions_previous_strategy_check` CHECK((`previous_target_weight_kg` is not null and `previous_center_kg` is null and (`previous_rate_pct_per_week` between -1 and -0.1 or `previous_rate_pct_per_week` between 0.1 and 0.5)) or (`previous_target_weight_kg` is null and `previous_center_kg` is not null and `previous_rate_pct_per_week` = 0)),
	CONSTRAINT `adaptive_nutrition_goal_revisions_reason_check` CHECK(`reason` in ('created', 'user_edit', 'migration', 'goal_completion')),
	CONSTRAINT `adaptive_nutrition_goal_revisions_date_check` CHECK(`effective_local_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_goal_revisions_goal_id_idx` ON `adaptive_nutrition_goal_revisions` (`goal_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_goal_revisions_goal_sequence_unique` ON `adaptive_nutrition_goal_revisions` (`goal_id`,`sequence`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_goal_revisions_id_goal_user_unique` ON `adaptive_nutrition_goal_revisions` (`id`,`goal_id`,`user_id`);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TRIGGER `adaptive_nutrition_checkins_immutable_snapshot_guard`;
--> statement-breakpoint
DROP TRIGGER `adaptive_nutrition_checkins_delete_guard`;
--> statement-breakpoint
CREATE TABLE `__new_adaptive_nutrition_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`program_id` text NOT NULL,
	`goal_id` text,
	`goal_revision_id` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`calculation_state` text NOT NULL,
	`local_date` text NOT NULL,
	`analysis_start` text,
	`analysis_end` text,
	`include_today` integer DEFAULT false NOT NULL,
	`algorithm_version` text NOT NULL,
	`data_fingerprint` text NOT NULL,
	`input_snapshot` text NOT NULL,
	`calculation_snapshot` text NOT NULL,
	`reason_codes` text NOT NULL,
	`prior_tdee_kcal` real,
	`observed_tdee_kcal` real,
	`proposed_tdee_kcal` real,
	`current_targets` text,
	`proposed_targets` text,
	`accepted_nutrition_target_id` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `adaptive_nutrition_programs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`,`user_id`) REFERENCES `adaptive_nutrition_programs`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `adaptive_nutrition_goals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`goal_revision_id`) REFERENCES `adaptive_nutrition_goal_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`goal_revision_id`,`goal_id`,`user_id`) REFERENCES `adaptive_nutrition_goal_revisions`(`id`,`goal_id`,`user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `adaptive_nutrition_checkins_kind_check` CHECK(`kind` in ('baseline', 'weekly', 'manual', 'goal_change')),
	CONSTRAINT `adaptive_nutrition_checkins_status_check` CHECK(`status` in ('pending', 'accepted', 'declined', 'superseded', 'held')),
	CONSTRAINT `adaptive_nutrition_checkins_calculation_state_check` CHECK(`calculation_state` in ('baseline', 'learning', 'updating', 'holding')),
	CONSTRAINT `adaptive_nutrition_checkins_local_date_format_check` CHECK(`local_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT `adaptive_nutrition_checkins_analysis_dates_format_check` CHECK((`analysis_start` is null or `analysis_start` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]') and (`analysis_end` is null or `analysis_end` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
	CONSTRAINT `adaptive_nutrition_checkins_fingerprint_check` CHECK(length(`data_fingerprint`) = 64 and `data_fingerprint` not glob '*[^0-9a-f]*'),
	CONSTRAINT `adaptive_nutrition_checkins_goal_link_pair_check` CHECK((`goal_id` is null) = (`goal_revision_id` is null))
);
--> statement-breakpoint
INSERT INTO `__new_adaptive_nutrition_checkins` (`id`,`user_id`,`program_id`,`goal_id`,`goal_revision_id`,`kind`,`status`,`calculation_state`,`local_date`,`analysis_start`,`analysis_end`,`include_today`,`algorithm_version`,`data_fingerprint`,`input_snapshot`,`calculation_snapshot`,`reason_codes`,`prior_tdee_kcal`,`observed_tdee_kcal`,`proposed_tdee_kcal`,`current_targets`,`proposed_targets`,`accepted_nutrition_target_id`,`resolved_at`,`created_at`)
SELECT `id`,`user_id`,`program_id`,NULL,NULL,`kind`,`status`,`calculation_state`,`local_date`,`analysis_start`,`analysis_end`,`include_today`,`algorithm_version`,`data_fingerprint`,`input_snapshot`,`calculation_snapshot`,`reason_codes`,`prior_tdee_kcal`,`observed_tdee_kcal`,`proposed_tdee_kcal`,`current_targets`,`proposed_targets`,`accepted_nutrition_target_id`,`resolved_at`,`created_at`
FROM `adaptive_nutrition_checkins`;
--> statement-breakpoint
DROP TABLE `adaptive_nutrition_checkins`;
--> statement-breakpoint
ALTER TABLE `__new_adaptive_nutrition_checkins` RENAME TO `adaptive_nutrition_checkins`;
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_checkins_user_id_created_at_idx` ON `adaptive_nutrition_checkins` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_checkins_program_id_local_date_idx` ON `adaptive_nutrition_checkins` (`program_id`,`local_date`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_checkins_pending_fingerprint_unique` ON `adaptive_nutrition_checkins` (`program_id`,`data_fingerprint`,`algorithm_version`) WHERE `status` = 'pending';
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_checkins_one_pending_per_program_unique` ON `adaptive_nutrition_checkins` (`program_id`) WHERE `status` = 'pending';
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_checkins_immutable_snapshot_guard`
BEFORE UPDATE ON `adaptive_nutrition_checkins`
WHEN
	NEW.`id` IS NOT OLD.`id`
	OR NEW.`user_id` IS NOT OLD.`user_id`
	OR NEW.`program_id` IS NOT OLD.`program_id`
	OR NEW.`goal_id` IS NOT OLD.`goal_id`
	OR NEW.`goal_revision_id` IS NOT OLD.`goal_revision_id`
	OR NEW.`kind` IS NOT OLD.`kind`
	OR NEW.`calculation_state` IS NOT OLD.`calculation_state`
	OR NEW.`local_date` IS NOT OLD.`local_date`
	OR NEW.`analysis_start` IS NOT OLD.`analysis_start`
	OR NEW.`analysis_end` IS NOT OLD.`analysis_end`
	OR NEW.`include_today` IS NOT OLD.`include_today`
	OR NEW.`algorithm_version` IS NOT OLD.`algorithm_version`
	OR NEW.`data_fingerprint` IS NOT OLD.`data_fingerprint`
	OR NEW.`input_snapshot` IS NOT OLD.`input_snapshot`
	OR NEW.`calculation_snapshot` IS NOT OLD.`calculation_snapshot`
	OR NEW.`reason_codes` IS NOT OLD.`reason_codes`
	OR NEW.`prior_tdee_kcal` IS NOT OLD.`prior_tdee_kcal`
	OR NEW.`observed_tdee_kcal` IS NOT OLD.`observed_tdee_kcal`
	OR NEW.`proposed_tdee_kcal` IS NOT OLD.`proposed_tdee_kcal`
	OR NEW.`current_targets` IS NOT OLD.`current_targets`
	OR NEW.`proposed_targets` IS NOT OLD.`proposed_targets`
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition check-in snapshots are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_checkins_delete_guard`
BEFORE DELETE ON `adaptive_nutrition_checkins`
WHEN NOT EXISTS (SELECT 1 FROM `adaptive_nutrition_account_deletion_scope` WHERE `user_id` = OLD.`user_id`)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition check-ins may only be deleted in account deletion scope');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_checkins_goal_link_insert_guard`
BEFORE INSERT ON `adaptive_nutrition_checkins`
WHEN NEW.`goal_id` IS NULL OR NEW.`goal_revision_id` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'new adaptive nutrition check-ins require an active goal revision');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_goals_immutable_fields_guard`
BEFORE UPDATE ON `adaptive_nutrition_goals`
WHEN
	OLD.`status` <> 'active'
	OR NEW.`id` IS NOT OLD.`id`
	OR NEW.`user_id` IS NOT OLD.`user_id`
	OR NEW.`program_id` IS NOT OLD.`program_id`
	OR NEW.`type` IS NOT OLD.`type`
	OR NEW.`start_trend_weight_kg` IS NOT OLD.`start_trend_weight_kg`
	OR NEW.`start_scale_weight_kg` IS NOT OLD.`start_scale_weight_kg`
	OR NEW.`started_local_date` IS NOT OLD.`started_local_date`
	OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT, 'closed goals and goal progress origins are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_goals_delete_guard`
BEFORE DELETE ON `adaptive_nutrition_goals`
WHEN NOT EXISTS (SELECT 1 FROM `adaptive_nutrition_account_deletion_scope` WHERE `user_id` = OLD.`user_id`)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition goals may only be deleted in account deletion scope');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_goal_revisions_update_guard`
BEFORE UPDATE ON `adaptive_nutrition_goal_revisions`
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition goal revisions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_goal_revisions_delete_guard`
BEFORE DELETE ON `adaptive_nutrition_goal_revisions`
WHEN NOT EXISTS (SELECT 1 FROM `adaptive_nutrition_account_deletion_scope` WHERE `user_id` = OLD.`user_id`)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition goal revisions may only be deleted in account deletion scope');
END;
