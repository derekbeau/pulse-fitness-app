CREATE TABLE `__new_session_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`set_number` integer NOT NULL,
	`weight` real,
	`reps` integer,
	`seconds` integer,
	`distance` real,
	`rpe` integer,
	`rir` integer,
	`zone` integer,
	`target_weight` real,
	`target_weight_min` real,
	`target_weight_max` real,
	`target_reps_min` integer,
	`target_reps_max` integer,
	`target_reps` integer,
	`target_seconds` integer,
	`target_distance` real,
	`target_zone` integer,
	`source_scheduled_set_id` text,
	`exercise_id_snapshot` text,
	`exercise_name_snapshot` text,
	`tracking_type_snapshot` text,
	`superset_group` text,
	`completed` integer DEFAULT false NOT NULL,
	`skipped` integer DEFAULT false NOT NULL,
	`section` text DEFAULT 'main' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `session_sets_set_number_check` CHECK(`set_number` > 0),
	CONSTRAINT `session_sets_seconds_check` CHECK(`seconds` is null or `seconds` >= 0),
	CONSTRAINT `session_sets_distance_check` CHECK(`distance` is null or `distance` >= 0),
	CONSTRAINT `session_sets_section_check` CHECK(`section` in ('warmup', 'main', 'cooldown', 'supplemental')),
	CONSTRAINT `session_sets_completion_state_check` CHECK(not (`completed` and `skipped`)),
	CONSTRAINT `session_sets_rpe_check` CHECK(`rpe` is null or `rpe` between 1 and 10),
	CONSTRAINT `session_sets_rir_check` CHECK(`rir` is null or (typeof(`rir`) = 'integer' and `rir` between 0 and 5)),
	CONSTRAINT `session_sets_effort_scale_check` CHECK(`rpe` is null or `rir` is null),
	CONSTRAINT `session_sets_zone_check` CHECK(`zone` is null or `zone` between 1 and 5),
	CONSTRAINT `session_sets_target_zone_check` CHECK(`target_zone` is null or `target_zone` between 1 and 5),
	CONSTRAINT `session_sets_target_reps_check` CHECK((`target_reps_min` is null or `target_reps_min` > 0) and (`target_reps_max` is null or `target_reps_max` > 0) and (`target_reps` is null or `target_reps` > 0) and (`target_reps_min` is null or `target_reps_max` is null or `target_reps_min` <= `target_reps_max`))
);
--> statement-breakpoint
INSERT INTO `__new_session_sets` (
	`id`, `session_id`, `exercise_id`, `order_index`, `set_number`, `weight`, `reps`,
	`seconds`, `distance`, `rpe`, `rir`, `zone`, `target_weight`, `target_weight_min`,
	`target_weight_max`, `target_reps_min`, `target_reps_max`, `target_reps`, `target_seconds`,
	`target_distance`, `target_zone`, `source_scheduled_set_id`, `exercise_id_snapshot`,
	`exercise_name_snapshot`, `tracking_type_snapshot`, `superset_group`, `completed`, `skipped`,
	`section`, `notes`, `created_at`
)
SELECT
	`id`, `session_id`, `exercise_id`, `order_index`, `set_number`, `weight`, `reps`,
	`seconds`, `distance`, `rpe`, null, `zone`, `target_weight`, `target_weight_min`,
	`target_weight_max`, `target_reps_min`, `target_reps_max`, `target_reps`, `target_seconds`,
	`target_distance`, `target_zone`, `source_scheduled_set_id`, `exercise_id_snapshot`,
	`exercise_name_snapshot`, `tracking_type_snapshot`, `superset_group`, `completed`, `skipped`,
	`section`, `notes`, `created_at`
FROM `session_sets`;
--> statement-breakpoint
DROP TABLE `session_sets`;
--> statement-breakpoint
ALTER TABLE `__new_session_sets` RENAME TO `session_sets`;
--> statement-breakpoint
CREATE INDEX `session_sets_session_id_idx` ON `session_sets` (`session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_sets_session_exercise_section_set_number_unique`
ON `session_sets` (`session_id`, `exercise_id`, `section`, `set_number`);
--> statement-breakpoint
CREATE TRIGGER `session_sets_exercise_scope_insert`
BEFORE INSERT ON `session_sets`
WHEN NEW.`exercise_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `workout_sessions` ws
    JOIN `exercises` e ON e.`id` = NEW.`exercise_id`
    WHERE ws.`id` = NEW.`session_id`
      AND (e.`user_id` IS NULL OR e.`user_id` = ws.`user_id`)
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid session_sets exercise link');
END;
--> statement-breakpoint
CREATE TRIGGER `session_sets_exercise_scope_update`
BEFORE UPDATE OF `session_id`, `exercise_id` ON `session_sets`
WHEN NEW.`exercise_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `workout_sessions` ws
    JOIN `exercises` e ON e.`id` = NEW.`exercise_id`
    WHERE ws.`id` = NEW.`session_id`
      AND (e.`user_id` IS NULL OR e.`user_id` = ws.`user_id`)
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid session_sets exercise link');
END;
--> statement-breakpoint
CREATE TRIGGER `session_sets_progression_target_insert_guard`
BEFORE INSERT ON `session_sets`
WHEN (NEW.`target_reps_min` IS NOT NULL AND NEW.`target_reps_min` <= 0)
  OR (NEW.`target_reps_max` IS NOT NULL AND NEW.`target_reps_max` <= 0)
  OR (NEW.`target_reps` IS NOT NULL AND NEW.`target_reps` <= 0)
  OR (NEW.`target_reps_min` IS NOT NULL AND NEW.`target_reps_max` IS NOT NULL AND NEW.`target_reps_min` > NEW.`target_reps_max`)
  OR (NEW.`target_zone` IS NOT NULL AND NEW.`target_zone` NOT BETWEEN 1 AND 5)
BEGIN SELECT RAISE(ABORT, 'invalid session progression target'); END;
--> statement-breakpoint
CREATE TRIGGER `session_sets_progression_target_update_guard`
BEFORE UPDATE ON `session_sets`
WHEN (NEW.`target_reps_min` IS NOT NULL AND NEW.`target_reps_min` <= 0)
  OR (NEW.`target_reps_max` IS NOT NULL AND NEW.`target_reps_max` <= 0)
  OR (NEW.`target_reps` IS NOT NULL AND NEW.`target_reps` <= 0)
  OR (NEW.`target_reps_min` IS NOT NULL AND NEW.`target_reps_max` IS NOT NULL AND NEW.`target_reps_min` > NEW.`target_reps_max`)
  OR (NEW.`target_zone` IS NOT NULL AND NEW.`target_zone` NOT BETWEEN 1 AND 5)
BEGIN SELECT RAISE(ABORT, 'invalid session progression target'); END;
