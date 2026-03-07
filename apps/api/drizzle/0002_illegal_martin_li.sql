CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`muscle_groups` text NOT NULL,
	`equipment` text NOT NULL,
	`category` text NOT NULL,
	`instructions` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "exercises_category_check" CHECK("exercises"."category" in ('compound', 'isolation', 'cardio', 'mobility'))
);
--> statement-breakpoint
CREATE INDEX `exercises_user_id_idx` ON `exercises` (`user_id`);--> statement-breakpoint
CREATE TABLE `workout_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`tags` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_templates_user_id_idx` ON `workout_templates` (`user_id`);--> statement-breakpoint
CREATE TABLE `template_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`sets` integer,
	`reps_min` integer,
	`reps_max` integer,
	`tempo` text,
	`rest_seconds` integer,
	`superset_group` text,
	`section` text NOT NULL,
	`notes` text,
	`cues` text,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "template_exercises_section_check" CHECK("template_exercises"."section" in ('warmup', 'main', 'cooldown')),
	CONSTRAINT "template_exercises_reps_range_check" CHECK("template_exercises"."reps_min" is null or "template_exercises"."reps_max" is null or "template_exercises"."reps_min" <= "template_exercises"."reps_max")
);
--> statement-breakpoint
CREATE INDEX `template_exercises_template_id_idx` ON `template_exercises` (`template_id`);--> statement-breakpoint
CREATE INDEX `template_exercises_exercise_id_idx` ON `template_exercises` (`exercise_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `template_exercises_template_section_order_unique` ON `template_exercises` (`template_id`,`section`,`order_index`);
