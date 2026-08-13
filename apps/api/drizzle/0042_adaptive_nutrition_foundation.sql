CREATE TABLE `adaptive_nutrition_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`program_id` text NOT NULL,
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
	CONSTRAINT "adaptive_nutrition_checkins_kind_check" CHECK("adaptive_nutrition_checkins"."kind" in ('baseline', 'weekly', 'manual')),
	CONSTRAINT "adaptive_nutrition_checkins_status_check" CHECK("adaptive_nutrition_checkins"."status" in ('pending', 'accepted', 'declined', 'superseded', 'held')),
	CONSTRAINT "adaptive_nutrition_checkins_calculation_state_check" CHECK("adaptive_nutrition_checkins"."calculation_state" in ('baseline', 'learning', 'updating', 'holding')),
	CONSTRAINT "adaptive_nutrition_checkins_local_date_format_check" CHECK("adaptive_nutrition_checkins"."local_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "adaptive_nutrition_checkins_analysis_dates_format_check" CHECK(("adaptive_nutrition_checkins"."analysis_start" is null or "adaptive_nutrition_checkins"."analysis_start" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]') and ("adaptive_nutrition_checkins"."analysis_end" is null or "adaptive_nutrition_checkins"."analysis_end" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
	CONSTRAINT "adaptive_nutrition_checkins_fingerprint_check" CHECK(length("adaptive_nutrition_checkins"."data_fingerprint") = 64 and "adaptive_nutrition_checkins"."data_fingerprint" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_checkins_user_id_created_at_idx` ON `adaptive_nutrition_checkins` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_checkins_program_id_local_date_idx` ON `adaptive_nutrition_checkins` (`program_id`,`local_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_checkins_pending_fingerprint_unique` ON `adaptive_nutrition_checkins` (`program_id`,`data_fingerprint`,`algorithm_version`) WHERE "adaptive_nutrition_checkins"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_checkins_one_pending_per_program_unique` ON `adaptive_nutrition_checkins` (`program_id`) WHERE "adaptive_nutrition_checkins"."status" = 'pending';--> statement-breakpoint
CREATE TABLE `adaptive_nutrition_programs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`time_zone` text NOT NULL,
	`height_cm` real,
	`birth_date` text,
	`rmr_equation` text NOT NULL,
	`activity_level` text,
	`activity_multiplier` real,
	`estimated_rmr_kcal` real,
	`calculated_baseline_tdee_kcal` real,
	`manual_baseline_tdee_kcal` real,
	`baseline_tdee_kcal` real NOT NULL,
	`goal_type` text NOT NULL,
	`target_weight_kg` real,
	`goal_rate_pct_per_week` real NOT NULL,
	`protein_grams` integer NOT NULL,
	`fat_allocation_pct` real NOT NULL,
	`system_calorie_floor_kcal` integer NOT NULL,
	`user_calorie_floor_kcal` integer NOT NULL,
	`algorithm_version` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "adaptive_nutrition_programs_status_check" CHECK("adaptive_nutrition_programs"."status" in ('active', 'paused')),
	CONSTRAINT "adaptive_nutrition_programs_rmr_equation_check" CHECK("adaptive_nutrition_programs"."rmr_equation" in ('mifflin_male', 'mifflin_female', 'manual_tdee')),
	CONSTRAINT "adaptive_nutrition_programs_activity_level_check" CHECK("adaptive_nutrition_programs"."activity_level" is null or "adaptive_nutrition_programs"."activity_level" in ('sedentary', 'low_active', 'active', 'very_active')),
	CONSTRAINT "adaptive_nutrition_programs_goal_type_check" CHECK("adaptive_nutrition_programs"."goal_type" in ('lose', 'maintain', 'gain')),
	CONSTRAINT "adaptive_nutrition_programs_height_check" CHECK("adaptive_nutrition_programs"."height_cm" is null or "adaptive_nutrition_programs"."height_cm" between 100 and 250),
	CONSTRAINT "adaptive_nutrition_programs_target_weight_check" CHECK("adaptive_nutrition_programs"."target_weight_kg" is null or "adaptive_nutrition_programs"."target_weight_kg" between 25 and 350),
	CONSTRAINT "adaptive_nutrition_programs_protein_check" CHECK("adaptive_nutrition_programs"."protein_grams" between 40 and 400),
	CONSTRAINT "adaptive_nutrition_programs_fat_allocation_check" CHECK("adaptive_nutrition_programs"."fat_allocation_pct" between 20 and 40),
	CONSTRAINT "adaptive_nutrition_programs_calorie_floor_check" CHECK("adaptive_nutrition_programs"."system_calorie_floor_kcal" >= 1200 and "adaptive_nutrition_programs"."user_calorie_floor_kcal" >= "adaptive_nutrition_programs"."system_calorie_floor_kcal")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_programs_user_id_unique` ON `adaptive_nutrition_programs` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_programs_id_user_id_unique` ON `adaptive_nutrition_programs` (`id`,`user_id`);--> statement-breakpoint
CREATE TABLE `adaptive_nutrition_account_deletion_scope` (
	`user_id` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_nutrition_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`status_updated_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "nutrition_logs_date_format_check" CHECK("__new_nutrition_logs"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "nutrition_logs_status_check" CHECK("__new_nutrition_logs"."status" in ('unknown', 'partial', 'complete'))
);
--> statement-breakpoint
INSERT INTO `__new_nutrition_logs`("id", "user_id", "date", "notes", "status", "status_updated_at", "created_at", "updated_at") SELECT "id", "user_id", "date", "notes", 'unknown', NULL, "created_at", "updated_at" FROM `nutrition_logs`;--> statement-breakpoint
DROP TABLE `nutrition_logs`;--> statement-breakpoint
ALTER TABLE `__new_nutrition_logs` RENAME TO `nutrition_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_logs_user_id_date_unique` ON `nutrition_logs` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `__new_nutrition_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`calories` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`adaptive_check_in_id` text,
	`macro_calories` real,
	`effective_date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`adaptive_check_in_id`) REFERENCES `adaptive_nutrition_checkins`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "nutrition_targets_effective_date_format_check" CHECK("__new_nutrition_targets"."effective_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "nutrition_targets_macros_nonnegative_check" CHECK("__new_nutrition_targets"."calories" >= 0 and "__new_nutrition_targets"."protein" >= 0 and "__new_nutrition_targets"."carbs" >= 0 and "__new_nutrition_targets"."fat" >= 0),
	CONSTRAINT "nutrition_targets_source_check" CHECK("__new_nutrition_targets"."source" in ('manual', 'adaptive')),
	CONSTRAINT "nutrition_targets_provenance_check" CHECK(("__new_nutrition_targets"."source" = 'manual' and "__new_nutrition_targets"."adaptive_check_in_id" is null) or ("__new_nutrition_targets"."source" = 'adaptive' and "__new_nutrition_targets"."adaptive_check_in_id" is not null)),
	CONSTRAINT "nutrition_targets_macro_calories_nonnegative_check" CHECK("__new_nutrition_targets"."macro_calories" is null or "__new_nutrition_targets"."macro_calories" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_nutrition_targets`("id", "user_id", "calories", "protein", "carbs", "fat", "source", "adaptive_check_in_id", "macro_calories", "effective_date", "created_at", "updated_at") SELECT "id", "user_id", "calories", "protein", "carbs", "fat", 'manual', NULL, ("protein" * 4) + ("carbs" * 4) + ("fat" * 9), "effective_date", "created_at", "updated_at" FROM `nutrition_targets`;--> statement-breakpoint
DROP TABLE `nutrition_targets`;--> statement-breakpoint
ALTER TABLE `__new_nutrition_targets` RENAME TO `nutrition_targets`;--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_targets_user_id_effective_date_unique` ON `nutrition_targets` (`user_id`,`effective_date`);
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_checkins_immutable_snapshot_guard`
BEFORE UPDATE ON `adaptive_nutrition_checkins`
WHEN
	NEW.`id` IS NOT OLD.`id`
	OR NEW.`user_id` IS NOT OLD.`user_id`
	OR NEW.`program_id` IS NOT OLD.`program_id`
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
WHEN NOT EXISTS (
	SELECT 1 FROM `adaptive_nutrition_account_deletion_scope`
	WHERE `user_id` = OLD.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition check-ins may only be deleted in account deletion scope');
END;
