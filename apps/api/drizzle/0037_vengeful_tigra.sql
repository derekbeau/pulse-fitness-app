CREATE TABLE `scheduled_workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`scheduled_workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`section` text NOT NULL,
	`order_index` integer NOT NULL,
	`programming_notes` text,
	`agent_notes` text,
	`agent_notes_meta` text,
	`template_cues` text,
	`superset_group` text,
	`tempo` text,
	`rest_seconds` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`scheduled_workout_id`) REFERENCES `scheduled_workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "scheduled_workout_exercises_section_check" CHECK("scheduled_workout_exercises"."section" in ('warmup', 'main', 'cooldown', 'supplemental'))
);
--> statement-breakpoint
CREATE INDEX `scheduled_workout_exercises_scheduled_workout_id_idx` ON `scheduled_workout_exercises` (`scheduled_workout_id`);--> statement-breakpoint
CREATE INDEX `scheduled_workout_exercises_exercise_id_idx` ON `scheduled_workout_exercises` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `scheduled_workout_exercise_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`scheduled_workout_exercise_id` text NOT NULL,
	`set_number` integer NOT NULL,
	`reps_min` integer,
	`reps_max` integer,
	`reps` integer,
	`target_weight` real,
	`target_weight_min` real,
	`target_weight_max` real,
	`target_seconds` integer,
	`target_distance` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`scheduled_workout_exercise_id`) REFERENCES `scheduled_workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "scheduled_workout_exercise_sets_set_number_check" CHECK("scheduled_workout_exercise_sets"."set_number" > 0),
	CONSTRAINT "scheduled_workout_exercise_sets_reps_range_check" CHECK("scheduled_workout_exercise_sets"."reps_min" is null or "scheduled_workout_exercise_sets"."reps_max" is null or "scheduled_workout_exercise_sets"."reps_min" <= "scheduled_workout_exercise_sets"."reps_max"),
	CONSTRAINT "scheduled_workout_exercise_sets_target_weight_range_check" CHECK("scheduled_workout_exercise_sets"."target_weight_min" is null or "scheduled_workout_exercise_sets"."target_weight_max" is null or "scheduled_workout_exercise_sets"."target_weight_min" <= "scheduled_workout_exercise_sets"."target_weight_max")
);
--> statement-breakpoint
CREATE INDEX `scheduled_workout_exercise_sets_exercise_id_idx` ON `scheduled_workout_exercise_sets` (`scheduled_workout_exercise_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text,
	`scheduled_workout_id` text,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'in-progress' NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`duration` integer,
	`time_segments` text DEFAULT '[]' NOT NULL,
	`feedback` text,
	`exercise_programming_notes` text,
	`exercise_agent_notes` text,
	`exercise_agent_notes_meta` text,
	`notes` text,
	`deleted_at` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`scheduled_workout_id`) REFERENCES `scheduled_workouts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workout_sessions_date_format_check" CHECK("__new_workout_sessions"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "workout_sessions_status_check" CHECK("__new_workout_sessions"."status" in ('scheduled', 'in-progress', 'paused', 'cancelled', 'completed')),
	CONSTRAINT "workout_sessions_completed_at_check" CHECK(("__new_workout_sessions"."status" != 'completed' or "__new_workout_sessions"."completed_at" is not null) and ("__new_workout_sessions"."completed_at" is null or "__new_workout_sessions"."completed_at" >= "__new_workout_sessions"."started_at"))
);
--> statement-breakpoint
INSERT INTO `__new_workout_sessions`(
	"id",
	"user_id",
	"template_id",
	"scheduled_workout_id",
	"name",
	"date",
	"status",
	"started_at",
	"completed_at",
	"duration",
	"time_segments",
	"feedback",
	"exercise_programming_notes",
	"exercise_agent_notes",
	"exercise_agent_notes_meta",
	"notes",
	"deleted_at",
	"created_at",
	"updated_at"
) SELECT
	"id",
	"user_id",
	"template_id",
	null,
	"name",
	"date",
	"status",
	"started_at",
	"completed_at",
	"duration",
	"time_segments",
	"feedback",
	"exercise_programming_notes",
	null,
	null,
	"notes",
	"deleted_at",
	"created_at",
	"updated_at"
FROM `workout_sessions`;--> statement-breakpoint
DROP TABLE `workout_sessions`;--> statement-breakpoint
ALTER TABLE `__new_workout_sessions` RENAME TO `workout_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `workout_sessions_user_id_idx` ON `workout_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `workout_sessions_date_idx` ON `workout_sessions` (`date`);--> statement-breakpoint
CREATE INDEX `workout_sessions_scheduled_workout_id_idx` ON `workout_sessions` (`scheduled_workout_id`);--> statement-breakpoint
ALTER TABLE `scheduled_workouts` ADD `template_version` text;
