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
	`section` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "session_sets_set_number_check" CHECK("__new_session_sets"."set_number" > 0),
	CONSTRAINT "session_sets_section_check" CHECK("__new_session_sets"."section" is null or "__new_session_sets"."section" in ('warmup', 'main', 'cooldown', 'supplemental')),
	CONSTRAINT "session_sets_completion_state_check" CHECK(not ("__new_session_sets"."completed" and "__new_session_sets"."skipped"))
);
--> statement-breakpoint
INSERT INTO `__new_session_sets`("id", "session_id", "exercise_id", "order_index", "set_number", "weight", "reps", "target_weight", "target_weight_min", "target_weight_max", "target_seconds", "target_distance", "superset_group", "completed", "skipped", "section", "notes", "created_at") SELECT "id", "session_id", "exercise_id", "order_index", "set_number", "weight", "reps", "target_weight", "target_weight_min", "target_weight_max", "target_seconds", "target_distance", "superset_group", "completed", "skipped", "section", "notes", "created_at" FROM `session_sets`;--> statement-breakpoint
DROP TABLE `session_sets`;--> statement-breakpoint
ALTER TABLE `__new_session_sets` RENAME TO `session_sets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `session_sets_session_id_idx` ON `session_sets` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_sets_session_exercise_set_number_unique` ON `session_sets` (`session_id`,`exercise_id`,`set_number`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_template_exercises` (
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
	`set_targets` text,
	`programming_notes` text,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "template_exercises_section_check" CHECK("__new_template_exercises"."section" in ('warmup', 'main', 'cooldown', 'supplemental')),
	CONSTRAINT "template_exercises_reps_range_check" CHECK("__new_template_exercises"."reps_min" is null or "__new_template_exercises"."reps_max" is null or "__new_template_exercises"."reps_min" <= "__new_template_exercises"."reps_max")
);
--> statement-breakpoint
INSERT INTO `__new_template_exercises`("id", "template_id", "exercise_id", "order_index", "sets", "reps_min", "reps_max", "tempo", "rest_seconds", "superset_group", "section", "notes", "cues", "set_targets", "programming_notes") SELECT "id", "template_id", "exercise_id", "order_index", "sets", "reps_min", "reps_max", "tempo", "rest_seconds", "superset_group", "section", "notes", "cues", "set_targets", "programming_notes" FROM `template_exercises`;--> statement-breakpoint
DROP TABLE `template_exercises`;--> statement-breakpoint
ALTER TABLE `__new_template_exercises` RENAME TO `template_exercises`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `template_exercises_template_id_idx` ON `template_exercises` (`template_id`);--> statement-breakpoint
CREATE INDEX `template_exercises_exercise_id_idx` ON `template_exercises` (`exercise_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `template_exercises_template_section_order_unique` ON `template_exercises` (`template_id`,`section`,`order_index`);
