PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`set_number` integer NOT NULL,
	`weight` real,
	`reps` integer,
	`target_weight` real,
	`target_weight_min` real,
	`target_weight_max` real,
	`target_seconds` integer,
	`target_distance` real,
	`superset_group` text,
	`completed` integer DEFAULT false NOT NULL,
	`skipped` integer DEFAULT false NOT NULL,
	`section` text DEFAULT 'main' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "session_sets_set_number_check" CHECK("__new_session_sets"."set_number" > 0),
	CONSTRAINT "session_sets_section_check" CHECK("__new_session_sets"."section" in ('warmup', 'main', 'cooldown', 'supplemental')),
	CONSTRAINT "session_sets_completion_state_check" CHECK(not ("__new_session_sets"."completed" and "__new_session_sets"."skipped"))
);
--> statement-breakpoint
INSERT INTO `__new_session_sets`("id", "session_id", "exercise_id", "order_index", "set_number", "weight", "reps", "target_weight", "target_weight_min", "target_weight_max", "target_seconds", "target_distance", "superset_group", "completed", "skipped", "section", "notes", "created_at") SELECT "id", "session_id", "exercise_id", "order_index", "set_number", "weight", "reps", "target_weight", "target_weight_min", "target_weight_max", "target_seconds", "target_distance", "superset_group", "completed", "skipped", coalesce("section", 'main'), "notes", "created_at" FROM `session_sets`;--> statement-breakpoint
DROP TABLE `session_sets`;--> statement-breakpoint
ALTER TABLE `__new_session_sets` RENAME TO `session_sets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `session_sets_session_id_idx` ON `session_sets` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_sets_session_exercise_section_set_number_unique` ON `session_sets` (`session_id`,`exercise_id`,`section`,`set_number`);
