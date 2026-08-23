ALTER TABLE `session_sets` ADD COLUMN `target_reps_min` integer;
--> statement-breakpoint
ALTER TABLE `session_sets` ADD COLUMN `target_reps_max` integer;
--> statement-breakpoint
ALTER TABLE `session_sets` ADD COLUMN `target_reps` integer;
--> statement-breakpoint
ALTER TABLE `session_sets` ADD COLUMN `target_zone` integer;
--> statement-breakpoint
ALTER TABLE `session_sets` ADD COLUMN `source_scheduled_set_id` text;
--> statement-breakpoint
ALTER TABLE `session_sets` ADD COLUMN `exercise_id_snapshot` text;
--> statement-breakpoint
ALTER TABLE `session_sets` ADD COLUMN `exercise_name_snapshot` text;
--> statement-breakpoint
ALTER TABLE `session_sets` ADD COLUMN `tracking_type_snapshot` text;
--> statement-breakpoint
UPDATE `session_sets`
SET `exercise_id_snapshot` = `exercise_id`,
    `exercise_name_snapshot` = (
      SELECT `exercise`.`name` FROM `exercises` AS `exercise`
      WHERE `exercise`.`id` = `session_sets`.`exercise_id`
    ),
    `tracking_type_snapshot` = (
      SELECT `exercise`.`tracking_type` FROM `exercises` AS `exercise`
      WHERE `exercise`.`id` = `session_sets`.`exercise_id`
    )
WHERE `exercise_id` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `scheduled_workout_exercise_sets` ADD COLUMN `target_zone` integer;
--> statement-breakpoint
ALTER TABLE `scheduled_workout_exercises` ADD COLUMN `exercise_name_snapshot` text;
--> statement-breakpoint
ALTER TABLE `scheduled_workout_exercises` ADD COLUMN `tracking_type_snapshot` text;
--> statement-breakpoint
UPDATE `scheduled_workout_exercises`
SET `exercise_name_snapshot` = (
      SELECT `exercise`.`name` FROM `exercises` AS `exercise`
      WHERE `exercise`.`id` = `scheduled_workout_exercises`.`exercise_id`
    ),
    `tracking_type_snapshot` = (
      SELECT `exercise`.`tracking_type` FROM `exercises` AS `exercise`
      WHERE `exercise`.`id` = `scheduled_workout_exercises`.`exercise_id`
    );
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
--> statement-breakpoint
CREATE TRIGGER `scheduled_workout_exercise_sets_target_zone_insert_guard`
BEFORE INSERT ON `scheduled_workout_exercise_sets`
WHEN NEW.`target_zone` IS NOT NULL AND NEW.`target_zone` NOT BETWEEN 1 AND 5
BEGIN SELECT RAISE(ABORT, 'invalid scheduled progression target zone'); END;
--> statement-breakpoint
CREATE TRIGGER `scheduled_workout_exercise_sets_target_zone_update_guard`
BEFORE UPDATE ON `scheduled_workout_exercise_sets`
WHEN NEW.`target_zone` IS NOT NULL AND NEW.`target_zone` NOT BETWEEN 1 AND 5
BEGIN SELECT RAISE(ABORT, 'invalid scheduled progression target zone'); END;
--> statement-breakpoint
CREATE TABLE `workout_progression_configurations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `scheduled_workout_id` text NOT NULL,
  `scheduled_workout_exercise_id` text NOT NULL,
  `revision` integer NOT NULL,
  `snapshot` text NOT NULL,
  `actor_type` text NOT NULL,
  `agent_token_id` text,
  `actor_label` text NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  FOREIGN KEY (`scheduled_workout_id`) REFERENCES `scheduled_workouts`(`id`) ON DELETE cascade,
  FOREIGN KEY (`scheduled_workout_exercise_id`) REFERENCES `scheduled_workout_exercises`(`id`) ON DELETE cascade,
  CONSTRAINT `workout_progression_configurations_scheduled_exercise_fk`
    FOREIGN KEY (`scheduled_workout_exercise_id`, `scheduled_workout_id`)
    REFERENCES `scheduled_workout_exercises`(`id`, `scheduled_workout_id`) ON DELETE cascade,
  CONSTRAINT `workout_progression_configurations_revision_check` CHECK (`revision` >= 1),
  CONSTRAINT `workout_progression_configurations_snapshot_check`
    CHECK (json_valid(`snapshot`) and json_type(`snapshot`) = 'object'),
  CONSTRAINT `workout_progression_configurations_actor_check`
    CHECK ((`actor_type` = 'user' and `agent_token_id` is null) or (`actor_type` = 'agent_token' and `agent_token_id` is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_progression_configurations_schedule_exercise_unique`
ON `workout_progression_configurations` (`scheduled_workout_exercise_id`);
--> statement-breakpoint
CREATE TRIGGER `workout_progression_configurations_owner_insert_guard`
BEFORE INSERT ON `workout_progression_configurations`
WHEN NOT EXISTS (
  SELECT 1 FROM `scheduled_workouts` AS `scheduled`
  JOIN `scheduled_workout_exercises` AS `exercise`
    ON `exercise`.`scheduled_workout_id` = `scheduled`.`id`
  WHERE `scheduled`.`id` = NEW.`scheduled_workout_id`
    AND `scheduled`.`user_id` = NEW.`user_id`
    AND `exercise`.`id` = NEW.`scheduled_workout_exercise_id`
)
BEGIN
  SELECT RAISE(ABORT, 'workout progression configuration ownership mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_configurations_owner_update_guard`
BEFORE UPDATE ON `workout_progression_configurations`
WHEN NEW.`id` <> OLD.`id`
  OR NEW.`user_id` <> OLD.`user_id`
  OR NEW.`scheduled_workout_id` <> OLD.`scheduled_workout_id`
  OR NEW.`scheduled_workout_exercise_id` <> OLD.`scheduled_workout_exercise_id`
  OR NEW.`revision` <> OLD.`revision` + 1
  OR NOT EXISTS (
    SELECT 1 FROM `scheduled_workouts` AS `scheduled`
    JOIN `scheduled_workout_exercises` AS `exercise`
      ON `exercise`.`scheduled_workout_id` = `scheduled`.`id`
    WHERE `scheduled`.`id` = NEW.`scheduled_workout_id`
      AND `scheduled`.`user_id` = NEW.`user_id`
      AND `exercise`.`id` = NEW.`scheduled_workout_exercise_id`
  )
BEGIN
  SELECT RAISE(ABORT, 'workout progression configuration revision or ownership mismatch');
END;
--> statement-breakpoint
DROP TRIGGER `workout_progression_actions_insert_sequence_guard`;
--> statement-breakpoint
DROP TRIGGER `workout_progression_actions_insert_terminal_guard`;
--> statement-breakpoint
DROP TRIGGER `workout_progression_actions_update_guard`;
--> statement-breakpoint
DROP TRIGGER `workout_progression_actions_delete_guard`;
--> statement-breakpoint
DROP TRIGGER `workout_progression_recommendations_owner_guard`;
--> statement-breakpoint
DROP TRIGGER `workout_progression_recommendations_update_guard`;
--> statement-breakpoint
DROP TRIGGER `workout_progression_recommendations_delete_guard`;
--> statement-breakpoint
DROP INDEX `workout_progression_actions_user_created_idx`;
--> statement-breakpoint
DROP INDEX `workout_progression_actions_recommendation_sequence_unique`;
--> statement-breakpoint
DROP INDEX `workout_progression_actions_user_idempotency_unique`;
--> statement-breakpoint
DROP INDEX `workout_progression_recommendations_user_generated_idx`;
--> statement-breakpoint
DROP INDEX `workout_progression_recommendations_schedule_idx`;
--> statement-breakpoint
DROP INDEX `workout_progression_recommendations_generation_unique`;
--> statement-breakpoint
DROP INDEX `workout_progression_recommendations_id_user_unique`;
--> statement-breakpoint
ALTER TABLE `workout_progression_actions` RENAME TO `__old_workout_progression_actions`;
--> statement-breakpoint
ALTER TABLE `workout_progression_recommendations` RENAME TO `__old_workout_progression_recommendations`;
--> statement-breakpoint
CREATE TABLE `workout_progression_recommendations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `scheduled_workout_id` text NOT NULL,
  `scheduled_workout_exercise_id` text NOT NULL,
  `exercise_id` text NOT NULL,
  `source_session_id` text,
  `policy_family` text NOT NULL,
  `policy_version` integer NOT NULL,
  `source_fingerprint` text NOT NULL,
  `effective_date` text NOT NULL,
  `snapshot` text NOT NULL,
  `generated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  CHECK (`policy_family` in ('unsupported', 'double_progression', 'strength_load', 'rpe_regulated', 'time_distance', 'rehab_capacity')),
  CHECK (`policy_version` = 1),
  CHECK (length(`source_fingerprint`) = 64 and `source_fingerprint` not glob '*[^0-9a-f]*'),
  CHECK (`effective_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK (json_valid(`snapshot`) and json_type(`snapshot`) = 'object'),
  CHECK (`generated_at` > 0)
);
--> statement-breakpoint
INSERT INTO `workout_progression_recommendations`
SELECT * FROM `__old_workout_progression_recommendations`;
--> statement-breakpoint
CREATE INDEX `workout_progression_recommendations_user_generated_idx`
ON `workout_progression_recommendations` (`user_id`, `generated_at`);
--> statement-breakpoint
CREATE INDEX `workout_progression_recommendations_schedule_idx`
ON `workout_progression_recommendations` (`scheduled_workout_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_progression_recommendations_generation_unique`
ON `workout_progression_recommendations` (`scheduled_workout_exercise_id`, `source_fingerprint`, `policy_version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_progression_recommendations_id_user_unique`
ON `workout_progression_recommendations` (`id`, `user_id`);
--> statement-breakpoint
CREATE TABLE `workout_progression_actions` (
  `id` text PRIMARY KEY NOT NULL,
  `recommendation_id` text NOT NULL,
  `user_id` text NOT NULL,
  `sequence` integer NOT NULL,
  `type` text NOT NULL,
  `payload` text NOT NULL,
  `actor_type` text NOT NULL,
  `agent_token_id` text,
  `actor_label` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_fingerprint` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`recommendation_id`) REFERENCES `workout_progression_recommendations`(`id`) ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  FOREIGN KEY (`recommendation_id`, `user_id`) REFERENCES `workout_progression_recommendations`(`id`, `user_id`) ON DELETE cascade,
  CHECK (`sequence` >= 1),
  CHECK (`type` in ('accept', 'edit', 'keep', 'hold')),
  CHECK (json_valid(`payload`) and json_type(`payload`) = 'object'),
  CHECK ((`actor_type` = 'user' and `agent_token_id` is null) or (`actor_type` = 'agent_token' and `agent_token_id` is not null)),
  CHECK (length(`request_fingerprint`) = 64 and `request_fingerprint` not glob '*[^0-9a-f]*'),
  CHECK (`created_at` > 0)
);
--> statement-breakpoint
INSERT INTO `workout_progression_actions` SELECT * FROM `__old_workout_progression_actions`;
--> statement-breakpoint
DROP TABLE `__old_workout_progression_actions`;
--> statement-breakpoint
DROP TABLE `__old_workout_progression_recommendations`;
--> statement-breakpoint
CREATE INDEX `workout_progression_actions_user_created_idx`
ON `workout_progression_actions` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_progression_actions_recommendation_sequence_unique`
ON `workout_progression_actions` (`recommendation_id`, `sequence`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_progression_actions_user_idempotency_unique`
ON `workout_progression_actions` (`user_id`, `idempotency_key`);
--> statement-breakpoint
CREATE TRIGGER `workout_progression_recommendations_owner_guard`
BEFORE INSERT ON `workout_progression_recommendations`
WHEN NOT EXISTS (
  SELECT 1 FROM `scheduled_workouts` AS `scheduled`
  JOIN `scheduled_workout_exercises` AS `exercise`
    ON `exercise`.`scheduled_workout_id` = `scheduled`.`id`
  WHERE `scheduled`.`id` = NEW.`scheduled_workout_id`
    AND `scheduled`.`user_id` = NEW.`user_id`
    AND `exercise`.`id` = NEW.`scheduled_workout_exercise_id`
    AND `exercise`.`exercise_id` = NEW.`exercise_id`
)
BEGIN
  SELECT RAISE(ABORT, 'workout progression recommendation ownership mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_recommendations_update_guard`
BEFORE UPDATE ON `workout_progression_recommendations`
BEGIN SELECT RAISE(ABORT, 'workout progression recommendations are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_recommendations_delete_guard`
BEFORE DELETE ON `workout_progression_recommendations`
WHEN NOT EXISTS (SELECT 1 FROM `workout_progression_account_deletion_scope` WHERE `user_id` = OLD.`user_id`)
BEGIN SELECT RAISE(ABORT, 'workout progression recommendations may only be deleted in account deletion scope'); END;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_actions_insert_sequence_guard`
BEFORE INSERT ON `workout_progression_actions`
WHEN NEW.`sequence` <> coalesce((SELECT max(`sequence`) + 1 FROM `workout_progression_actions` WHERE `recommendation_id` = NEW.`recommendation_id`), 1)
BEGIN SELECT RAISE(ABORT, 'workout progression actions require the exact next sequence'); END;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_actions_insert_terminal_guard`
BEFORE INSERT ON `workout_progression_actions`
WHEN EXISTS (SELECT 1 FROM `workout_progression_actions` WHERE `recommendation_id` = NEW.`recommendation_id`)
BEGIN SELECT RAISE(ABORT, 'workout progression recommendation already has a decision'); END;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_actions_update_guard`
BEFORE UPDATE ON `workout_progression_actions`
BEGIN SELECT RAISE(ABORT, 'workout progression actions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_actions_delete_guard`
BEFORE DELETE ON `workout_progression_actions`
WHEN NOT EXISTS (SELECT 1 FROM `workout_progression_account_deletion_scope` WHERE `user_id` = OLD.`user_id`)
BEGIN SELECT RAISE(ABORT, 'workout progression actions may only be deleted in account deletion scope'); END;
--> statement-breakpoint
DROP TRIGGER `exercise_muscle_contributions_owner_guard`;
--> statement-breakpoint
DROP TRIGGER `exercise_muscle_contributions_revision_guard`;
--> statement-breakpoint
DROP TRIGGER `exercise_muscle_contributions_update_guard`;
--> statement-breakpoint
DROP TRIGGER `exercise_muscle_contributions_delete_guard`;
--> statement-breakpoint
DROP INDEX `exercise_muscle_contributions_exercise_effective_idx`;
--> statement-breakpoint
DROP INDEX `exercise_muscle_contributions_owner_idx`;
--> statement-breakpoint
DROP INDEX `exercise_muscle_contributions_revision_muscle_unique`;
--> statement-breakpoint
ALTER TABLE `exercise_muscle_contributions` RENAME TO `__old_exercise_muscle_contributions`;
--> statement-breakpoint
CREATE TABLE `exercise_muscle_contributions` (
  `id` text PRIMARY KEY NOT NULL,
  `exercise_id` text NOT NULL,
  `owner_user_id` text,
  `revision` integer NOT NULL,
  `muscle` text NOT NULL,
  `role` text NOT NULL,
  `factor` real NOT NULL,
  `version` integer NOT NULL,
  `effective_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  CHECK (`revision` >= 1),
  CHECK (length(trim(`muscle`)) between 1 and 100),
  CHECK ((`role` = 'primary' and `factor` = 1.0) or (`role` = 'secondary' and `factor` = 0.5)),
  CHECK (`version` = 1),
  CHECK (`effective_at` > 0 and `created_at` >= `effective_at`)
);
--> statement-breakpoint
INSERT INTO `exercise_muscle_contributions` SELECT * FROM `__old_exercise_muscle_contributions`;
--> statement-breakpoint
DROP TABLE `__old_exercise_muscle_contributions`;
--> statement-breakpoint
CREATE INDEX `exercise_muscle_contributions_exercise_effective_idx`
ON `exercise_muscle_contributions` (`exercise_id`, `effective_at`, `revision`);
--> statement-breakpoint
CREATE INDEX `exercise_muscle_contributions_owner_idx`
ON `exercise_muscle_contributions` (`owner_user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_muscle_contributions_revision_muscle_unique`
ON `exercise_muscle_contributions` (`exercise_id`, coalesce(`owner_user_id`, ''), `revision`, lower(`muscle`));
--> statement-breakpoint
CREATE TRIGGER `exercise_muscle_contributions_revision_guard`
BEFORE INSERT ON `exercise_muscle_contributions`
WHEN NEW.`revision` < coalesce((SELECT max(`revision`) FROM `exercise_muscle_contributions` WHERE `exercise_id` = NEW.`exercise_id` AND coalesce(`owner_user_id`, '') = coalesce(NEW.`owner_user_id`, '')), 0)
  OR NEW.`revision` > coalesce((SELECT max(`revision`) + 1 FROM `exercise_muscle_contributions` WHERE `exercise_id` = NEW.`exercise_id` AND coalesce(`owner_user_id`, '') = coalesce(NEW.`owner_user_id`, '')), 1)
BEGIN SELECT RAISE(ABORT, 'exercise muscle contributions require the current or exact next revision'); END;
--> statement-breakpoint
CREATE TRIGGER `exercise_muscle_contributions_update_guard`
BEFORE UPDATE ON `exercise_muscle_contributions`
BEGIN SELECT RAISE(ABORT, 'exercise muscle contributions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `exercise_muscle_contributions_delete_guard`
BEFORE DELETE ON `exercise_muscle_contributions`
WHEN OLD.`owner_user_id` IS NULL OR NOT EXISTS (SELECT 1 FROM `workout_progression_account_deletion_scope` WHERE `user_id` = OLD.`owner_user_id`)
BEGIN SELECT RAISE(ABORT, 'exercise muscle contributions may only be deleted in account deletion scope'); END;
