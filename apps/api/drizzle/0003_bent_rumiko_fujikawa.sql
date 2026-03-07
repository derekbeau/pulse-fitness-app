CREATE TABLE `workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'in-progress' NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`duration` text,
	`feedback` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workout_sessions_date_format_check" CHECK("workout_sessions"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "workout_sessions_status_check" CHECK("workout_sessions"."status" in ('scheduled', 'in-progress', 'completed')),
	CONSTRAINT "workout_sessions_completed_at_check" CHECK("workout_sessions"."completed_at" is null or "workout_sessions"."completed_at" >= "workout_sessions"."started_at")
);
--> statement-breakpoint
CREATE INDEX `workout_sessions_user_id_idx` ON `workout_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `workout_sessions_date_idx` ON `workout_sessions` (`date`);--> statement-breakpoint
CREATE TABLE `session_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`set_number` integer NOT NULL,
	`weight` real,
	`reps` integer,
	`completed` integer DEFAULT false NOT NULL,
	`skipped` integer DEFAULT false NOT NULL,
	`section` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_sets_set_number_check" CHECK("session_sets"."set_number" > 0),
	CONSTRAINT "session_sets_section_check" CHECK("session_sets"."section" is null or "session_sets"."section" in ('warmup', 'main', 'cooldown')),
	CONSTRAINT "session_sets_completion_state_check" CHECK(not ("session_sets"."completed" and "session_sets"."skipped"))
);
--> statement-breakpoint
CREATE INDEX `session_sets_session_id_idx` ON `session_sets` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_sets_session_exercise_set_number_unique` ON `session_sets` (`session_id`,`exercise_id`,`set_number`);
