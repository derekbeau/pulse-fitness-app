CREATE TABLE `body_weight` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`weight` real NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "body_weight_date_format_check" CHECK("body_weight"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "body_weight_weight_check" CHECK("body_weight"."weight" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_weight_user_id_date_unique` ON `body_weight` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `dashboard_config` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`habit_chain_ids` text DEFAULT '[]' NOT NULL,
	`trend_metrics` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_config_user_id_unique` ON `dashboard_config` (`user_id`);--> statement-breakpoint
CREATE TABLE `nutrition_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`calories` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`effective_date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "nutrition_targets_effective_date_format_check" CHECK("nutrition_targets"."effective_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "nutrition_targets_macros_nonnegative_check" CHECK("nutrition_targets"."calories" >= 0 and "nutrition_targets"."protein" >= 0 and "nutrition_targets"."carbs" >= 0 and "nutrition_targets"."fat" >= 0)
);
--> statement-breakpoint
CREATE INDEX `nutrition_targets_user_effective_date_idx` ON `nutrition_targets` (`user_id`,`effective_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_targets_user_id_effective_date_unique` ON `nutrition_targets` (`user_id`,`effective_date`);--> statement-breakpoint
CREATE TABLE `scheduled_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text NOT NULL,
	`date` text NOT NULL,
	`session_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "scheduled_workouts_date_format_check" CHECK("scheduled_workouts"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `scheduled_workouts_user_date_idx` ON `scheduled_workouts` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `scheduled_workouts_template_id_idx` ON `scheduled_workouts` (`template_id`);--> statement-breakpoint
CREATE INDEX `scheduled_workouts_session_id_idx` ON `scheduled_workouts` (`session_id`);