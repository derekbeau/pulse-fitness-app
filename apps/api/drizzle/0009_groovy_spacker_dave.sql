PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_entity_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`target_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "entity_links_source_type_check" CHECK("__new_entity_links"."source_type" in ('journal', 'activity', 'resource')),
	CONSTRAINT "entity_links_target_type_check" CHECK("__new_entity_links"."target_type" in ('workout', 'activity', 'habit', 'injury', 'exercise', 'protocol'))
);
--> statement-breakpoint
INSERT INTO `__new_entity_links`(
	`id`,
	`user_id`,
	`source_type`,
	`source_id`,
	`target_type`,
	`target_id`,
	`target_name`,
	`created_at`
)
SELECT
	`id`,
	CASE
		WHEN `source_type` = 'journal' THEN (SELECT `user_id` FROM `journal_entries` WHERE `id` = `source_id`)
		WHEN `source_type` = 'activity' THEN (SELECT `user_id` FROM `activities` WHERE `id` = `source_id`)
		WHEN `source_type` = 'resource' THEN (SELECT `user_id` FROM `resources` WHERE `id` = `source_id`)
	END,
	`source_type`,
	`source_id`,
	`target_type`,
	`target_id`,
	`target_name`,
	`created_at`
FROM `entity_links`;--> statement-breakpoint
DROP TABLE `entity_links`;--> statement-breakpoint
ALTER TABLE `__new_entity_links` RENAME TO `entity_links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `entity_links_user_source_type_source_id_idx` ON `entity_links` (`user_id`,`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `entity_links_user_target_type_target_id_idx` ON `entity_links` (`user_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tokens_token_hash_unique` ON `agent_tokens` (`token_hash`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session_sets` (
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
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "session_sets_set_number_check" CHECK("__new_session_sets"."set_number" > 0),
	CONSTRAINT "session_sets_section_check" CHECK("__new_session_sets"."section" is null or "__new_session_sets"."section" in ('warmup', 'main', 'cooldown')),
	CONSTRAINT "session_sets_completion_state_check" CHECK(not ("__new_session_sets"."completed" and "__new_session_sets"."skipped"))
);
--> statement-breakpoint
INSERT INTO `__new_session_sets`("id", "session_id", "exercise_id", "set_number", "weight", "reps", "completed", "skipped", "section", "notes", "created_at") SELECT "id", "session_id", "exercise_id", "set_number", "weight", "reps", "completed", "skipped", "section", "notes", "created_at" FROM `session_sets`;--> statement-breakpoint
DROP TABLE `session_sets`;--> statement-breakpoint
ALTER TABLE `__new_session_sets` RENAME TO `session_sets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `session_sets_session_id_idx` ON `session_sets` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_sets_session_exercise_set_number_unique` ON `session_sets` (`session_id`,`exercise_id`,`set_number`);
