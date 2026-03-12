PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'in-progress' NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`duration` integer,
	`time_segments` text DEFAULT '[]' NOT NULL,
	`feedback` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workout_sessions_date_format_check" CHECK("__new_workout_sessions"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "workout_sessions_status_check" CHECK("__new_workout_sessions"."status" in ('scheduled', 'in-progress', 'paused', 'cancelled', 'completed')),
	CONSTRAINT "workout_sessions_completed_at_check" CHECK(("__new_workout_sessions"."status" != 'completed' or "__new_workout_sessions"."completed_at" is not null) and ("__new_workout_sessions"."completed_at" is null or "__new_workout_sessions"."completed_at" >= "__new_workout_sessions"."started_at"))
);
--> statement-breakpoint
INSERT INTO `__new_workout_sessions`("id", "user_id", "template_id", "name", "date", "status", "started_at", "completed_at", "duration", "time_segments", "feedback", "notes", "created_at", "updated_at") SELECT "id", "user_id", "template_id", "name", "date", "status", "started_at", "completed_at", "duration", '[]', "feedback", "notes", "created_at", "updated_at" FROM `workout_sessions`;--> statement-breakpoint
DROP TABLE `workout_sessions`;--> statement-breakpoint
ALTER TABLE `__new_workout_sessions` RENAME TO `workout_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `workout_sessions_user_id_idx` ON `workout_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `workout_sessions_date_idx` ON `workout_sessions` (`date`);
