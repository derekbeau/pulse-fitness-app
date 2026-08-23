CREATE UNIQUE INDEX `scheduled_workout_exercises_id_scheduled_workout_unique`
ON `scheduled_workout_exercises` (`id`, `scheduled_workout_id`);
--> statement-breakpoint
CREATE TABLE `workout_progression_account_deletion_scope` (
	`user_id` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scheduled_workout_id`) REFERENCES `scheduled_workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scheduled_workout_exercise_id`) REFERENCES `scheduled_workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `workout_progression_recommendations_scheduled_exercise_fk`
		FOREIGN KEY (`scheduled_workout_exercise_id`, `scheduled_workout_id`)
		REFERENCES `scheduled_workout_exercises`(`id`, `scheduled_workout_id`)
		ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `workout_progression_recommendations_policy_family_check`
		CHECK(`policy_family` in ('double_progression', 'strength_load', 'rpe_regulated', 'time_distance', 'rehab_capacity')),
	CONSTRAINT `workout_progression_recommendations_policy_version_check` CHECK(`policy_version` = 1),
	CONSTRAINT `workout_progression_recommendations_fingerprint_check`
		CHECK(length(`source_fingerprint`) = 64 and `source_fingerprint` not glob '*[^0-9a-f]*'),
	CONSTRAINT `workout_progression_recommendations_effective_date_check`
		CHECK(`effective_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT `workout_progression_recommendations_snapshot_check`
		CHECK(json_valid(`snapshot`) and json_type(`snapshot`) = 'object'),
	CONSTRAINT `workout_progression_recommendations_generated_at_check` CHECK(`generated_at` > 0)
);
--> statement-breakpoint
CREATE INDEX `workout_progression_recommendations_user_generated_idx`
ON `workout_progression_recommendations` (`user_id`, `generated_at`);
--> statement-breakpoint
CREATE INDEX `workout_progression_recommendations_schedule_idx`
ON `workout_progression_recommendations` (`scheduled_workout_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_progression_recommendations_generation_unique`
ON `workout_progression_recommendations`
(`scheduled_workout_exercise_id`, `source_fingerprint`, `policy_version`);
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
	FOREIGN KEY (`recommendation_id`) REFERENCES `workout_progression_recommendations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `workout_progression_actions_recommendation_user_fk`
		FOREIGN KEY (`recommendation_id`, `user_id`)
		REFERENCES `workout_progression_recommendations`(`id`, `user_id`)
		ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `workout_progression_actions_sequence_check` CHECK(`sequence` >= 1),
	CONSTRAINT `workout_progression_actions_type_check` CHECK(`type` in ('accept', 'edit', 'keep', 'hold')),
	CONSTRAINT `workout_progression_actions_payload_check`
		CHECK(json_valid(`payload`) and json_type(`payload`) = 'object'),
	CONSTRAINT `workout_progression_actions_actor_check`
		CHECK((`actor_type` = 'user' and `agent_token_id` is null) or (`actor_type` = 'agent_token' and `agent_token_id` is not null)),
	CONSTRAINT `workout_progression_actions_request_fingerprint_check`
		CHECK(length(`request_fingerprint`) = 64 and `request_fingerprint` not glob '*[^0-9a-f]*'),
	CONSTRAINT `workout_progression_actions_created_at_check` CHECK(`created_at` > 0)
);
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
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `exercise_muscle_contributions_revision_check` CHECK(`revision` >= 1),
	CONSTRAINT `exercise_muscle_contributions_muscle_check` CHECK(length(trim(`muscle`)) between 1 and 100),
	CONSTRAINT `exercise_muscle_contributions_role_factor_check`
		CHECK((`role` = 'primary' and `factor` = 1.0) or (`role` = 'secondary' and `factor` = 0.5)),
	CONSTRAINT `exercise_muscle_contributions_version_check` CHECK(`version` = 1),
	CONSTRAINT `exercise_muscle_contributions_timestamps_check`
		CHECK(`effective_at` > 0 and `created_at` >= `effective_at`)
);
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
WITH `legacy_muscles` AS (
	SELECT
		`exercise`.`id` AS `exercise_id`,
		`exercise`.`user_id` AS `owner_user_id`,
		trim(CAST(`muscle`.`value` AS text)) AS `muscle`,
		min(CAST(`muscle`.`key` AS integer)) AS `first_position`,
		max(`exercise`.`created_at`, 1) AS `effective_at`
	FROM `exercises` AS `exercise`, json_each(`exercise`.`muscle_groups`) AS `muscle`
	WHERE json_valid(`exercise`.`muscle_groups`)
		AND json_type(`exercise`.`muscle_groups`) = 'array'
		AND length(trim(CAST(`muscle`.`value` AS text))) BETWEEN 1 AND 100
	GROUP BY `exercise`.`id`, `exercise`.`user_id`, lower(trim(CAST(`muscle`.`value` AS text)))
),
`ranked_muscles` AS (
	SELECT *, row_number() OVER (
		PARTITION BY `exercise_id`
		ORDER BY `first_position`, lower(`muscle`)
	) AS `muscle_rank`
	FROM `legacy_muscles`
)
INSERT INTO `exercise_muscle_contributions` (
	`id`, `exercise_id`, `owner_user_id`, `revision`, `muscle`, `role`, `factor`, `version`,
	`effective_at`, `created_at`
)
SELECT
	'migration-muscle-' || `exercise_id` || '-' || `muscle_rank`,
	`exercise_id`,
	`owner_user_id`,
	1,
	`muscle`,
	CASE WHEN `muscle_rank` = 1 THEN 'primary' ELSE 'secondary' END,
	CASE WHEN `muscle_rank` = 1 THEN 1.0 ELSE 0.5 END,
	1,
	`effective_at`,
	`effective_at`
FROM `ranked_muscles`;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_recommendations_owner_guard`
BEFORE INSERT ON `workout_progression_recommendations`
WHEN NOT EXISTS (
	SELECT 1
	FROM `scheduled_workouts` AS `scheduled`
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
BEGIN
	SELECT RAISE(ABORT, 'workout progression recommendations are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_recommendations_delete_guard`
BEFORE DELETE ON `workout_progression_recommendations`
WHEN NOT EXISTS (
	SELECT 1 FROM `workout_progression_account_deletion_scope` AS `scope`
	WHERE `scope`.`user_id` = OLD.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'workout progression recommendations may only be deleted in account deletion scope');
END;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_actions_insert_sequence_guard`
BEFORE INSERT ON `workout_progression_actions`
WHEN NEW.`sequence` <> coalesce((
	SELECT max(`action`.`sequence`) + 1
	FROM `workout_progression_actions` AS `action`
	WHERE `action`.`recommendation_id` = NEW.`recommendation_id`
), 1)
BEGIN
	SELECT RAISE(ABORT, 'workout progression actions require the exact next sequence');
END;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_actions_insert_terminal_guard`
BEFORE INSERT ON `workout_progression_actions`
WHEN EXISTS (
	SELECT 1 FROM `workout_progression_actions` AS `action`
	WHERE `action`.`recommendation_id` = NEW.`recommendation_id`
)
BEGIN
	SELECT RAISE(ABORT, 'workout progression recommendation already has a decision');
END;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_actions_update_guard`
BEFORE UPDATE ON `workout_progression_actions`
BEGIN
	SELECT RAISE(ABORT, 'workout progression actions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `workout_progression_actions_delete_guard`
BEFORE DELETE ON `workout_progression_actions`
WHEN NOT EXISTS (
	SELECT 1 FROM `workout_progression_account_deletion_scope` AS `scope`
	WHERE `scope`.`user_id` = OLD.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'workout progression actions may only be deleted in account deletion scope');
END;
--> statement-breakpoint
CREATE TRIGGER `exercise_muscle_contributions_owner_guard`
BEFORE INSERT ON `exercise_muscle_contributions`
WHEN NOT EXISTS (
	SELECT 1 FROM `exercises` AS `exercise`
	WHERE `exercise`.`id` = NEW.`exercise_id`
		AND coalesce(`exercise`.`user_id`, '') = coalesce(NEW.`owner_user_id`, '')
)
BEGIN
	SELECT RAISE(ABORT, 'exercise muscle contribution ownership mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `exercise_muscle_contributions_revision_guard`
BEFORE INSERT ON `exercise_muscle_contributions`
WHEN NEW.`revision` < coalesce((
	SELECT max(`contribution`.`revision`)
	FROM `exercise_muscle_contributions` AS `contribution`
	WHERE `contribution`.`exercise_id` = NEW.`exercise_id`
		AND coalesce(`contribution`.`owner_user_id`, '') = coalesce(NEW.`owner_user_id`, '')
), 0)
	OR NEW.`revision` > coalesce((
	SELECT max(`contribution`.`revision`) + 1
	FROM `exercise_muscle_contributions` AS `contribution`
	WHERE `contribution`.`exercise_id` = NEW.`exercise_id`
		AND coalesce(`contribution`.`owner_user_id`, '') = coalesce(NEW.`owner_user_id`, '')
), 1)
BEGIN
	SELECT RAISE(ABORT, 'exercise muscle contributions require the current or exact next revision');
END;
--> statement-breakpoint
CREATE TRIGGER `exercise_muscle_contributions_update_guard`
BEFORE UPDATE ON `exercise_muscle_contributions`
BEGIN
	SELECT RAISE(ABORT, 'exercise muscle contributions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `exercise_muscle_contributions_delete_guard`
BEFORE DELETE ON `exercise_muscle_contributions`
WHEN OLD.`owner_user_id` IS NULL
	OR NOT EXISTS (
		SELECT 1 FROM `workout_progression_account_deletion_scope` AS `scope`
		WHERE `scope`.`user_id` = OLD.`owner_user_id`
	)
BEGIN
	SELECT RAISE(ABORT, 'exercise muscle contributions may only be deleted in account deletion scope');
END;
