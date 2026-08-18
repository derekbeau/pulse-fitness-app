CREATE TABLE `adaptive_nutrition_program_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`user_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`effective_at` integer NOT NULL,
	`snapshot` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `adaptive_nutrition_programs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_program_revisions_program_user_fk`
		FOREIGN KEY (`program_id`,`user_id`)
		REFERENCES `adaptive_nutrition_programs`(`id`,`user_id`)
		ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_program_revisions_source_check`
		CHECK (`source` in ('program_created', 'program_updated', 'goal_updated', 'migration')),
	CONSTRAINT `adaptive_nutrition_program_revisions_sequence_check` CHECK (`sequence` >= 1),
	CONSTRAINT `adaptive_nutrition_program_revisions_effective_at_check` CHECK (`effective_at` > 0),
	CONSTRAINT `adaptive_nutrition_program_revisions_snapshot_check`
		CHECK (json_valid(`snapshot`) AND json_type(`snapshot`) = 'object')
);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_program_revisions_program_effective_idx`
	ON `adaptive_nutrition_program_revisions` (`program_id`,`effective_at`,`sequence`);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_program_revisions_user_id_idx`
	ON `adaptive_nutrition_program_revisions` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_program_revisions_id_user_unique`
	ON `adaptive_nutrition_program_revisions` (`id`,`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_program_revisions_program_sequence_unique`
	ON `adaptive_nutrition_program_revisions` (`program_id`,`sequence`);
--> statement-breakpoint
INSERT INTO `adaptive_nutrition_program_revisions` (
	`id`, `program_id`, `user_id`, `sequence`, `effective_at`, `snapshot`, `source`, `created_at`
)
SELECT
	'migration-created-' || `program`.`id`,
	`program`.`id`,
	`program`.`user_id`,
	1,
	`program`.`created_at`,
	coalesce(
		(
			SELECT json_extract(`checkin`.`input_snapshot`, '$.program')
			FROM `adaptive_nutrition_checkins` AS `checkin`
			WHERE `checkin`.`program_id` = `program`.`id`
				AND `checkin`.`user_id` = `program`.`user_id`
				AND json_valid(`checkin`.`input_snapshot`)
				AND json_type(`checkin`.`input_snapshot`, '$.program') = 'object'
			ORDER BY `checkin`.`created_at`, `checkin`.`id`
			LIMIT 1
		),
		json_object(
			'status', `program`.`status`,
			'timeZone', `program`.`time_zone`,
			'rmrEquation', `program`.`rmr_equation`,
			'heightCm', `program`.`height_cm`,
			'birthDate', `program`.`birth_date`,
			'activityLevel', `program`.`activity_level`,
			'activityMultiplier', `program`.`activity_multiplier`,
			'estimatedRmrKcal', `program`.`estimated_rmr_kcal`,
			'calculatedBaselineTdeeKcal', `program`.`calculated_baseline_tdee_kcal`,
			'manualBaselineTdeeKcal', `program`.`manual_baseline_tdee_kcal`,
			'baselineTdeeKcal', `program`.`baseline_tdee_kcal`,
			'goalType', `program`.`goal_type`,
			'targetWeightKg', `program`.`target_weight_kg`,
			'goalRatePctPerWeek', `program`.`goal_rate_pct_per_week`,
			'proteinGrams', `program`.`protein_grams`,
			'fatAllocationPct', `program`.`fat_allocation_pct`,
			'systemCalorieFloorKcal', `program`.`system_calorie_floor_kcal`,
			'userCalorieFloorKcal', `program`.`user_calorie_floor_kcal`,
			'algorithmVersion', `program`.`algorithm_version`
		)
	),
	'migration',
	`program`.`created_at`
FROM `adaptive_nutrition_programs` AS `program`;
--> statement-breakpoint
INSERT INTO `adaptive_nutrition_program_revisions` (
	`id`, `program_id`, `user_id`, `sequence`, `effective_at`, `snapshot`, `source`, `created_at`
)
SELECT
	'migration-checkin-' || `checkin`.`id`,
	`checkin`.`program_id`,
	`checkin`.`user_id`,
	row_number() OVER (
		PARTITION BY `checkin`.`program_id`
		ORDER BY `checkin`.`created_at`, `checkin`.`id`
	) + 1,
	`checkin`.`created_at`,
	json_extract(`checkin`.`input_snapshot`, '$.program'),
	'migration',
	`checkin`.`created_at`
FROM `adaptive_nutrition_checkins` AS `checkin`
WHERE json_valid(`checkin`.`input_snapshot`)
	AND json_type(`checkin`.`input_snapshot`, '$.program') = 'object'
	AND `checkin`.`id` <> (
		SELECT `initial`.`id`
		FROM `adaptive_nutrition_checkins` AS `initial`
		WHERE `initial`.`program_id` = `checkin`.`program_id`
			AND `initial`.`user_id` = `checkin`.`user_id`
			AND json_valid(`initial`.`input_snapshot`)
			AND json_type(`initial`.`input_snapshot`, '$.program') = 'object'
		ORDER BY `initial`.`created_at`, `initial`.`id`
		LIMIT 1
	);
--> statement-breakpoint
INSERT INTO `adaptive_nutrition_program_revisions` (
	`id`, `program_id`, `user_id`, `sequence`, `effective_at`, `snapshot`, `source`, `created_at`
)
SELECT
	'migration-current-' || `program`.`id`,
	`program`.`id`,
	`program`.`user_id`,
	(
		SELECT coalesce(max(`revision`.`sequence`), 0) + 1
		FROM `adaptive_nutrition_program_revisions` AS `revision`
		WHERE `revision`.`program_id` = `program`.`id`
	),
	`program`.`updated_at`,
	json_object(
		'status', `program`.`status`,
		'timeZone', `program`.`time_zone`,
		'rmrEquation', `program`.`rmr_equation`,
		'heightCm', `program`.`height_cm`,
		'birthDate', `program`.`birth_date`,
		'activityLevel', `program`.`activity_level`,
		'activityMultiplier', `program`.`activity_multiplier`,
		'estimatedRmrKcal', `program`.`estimated_rmr_kcal`,
		'calculatedBaselineTdeeKcal', `program`.`calculated_baseline_tdee_kcal`,
		'manualBaselineTdeeKcal', `program`.`manual_baseline_tdee_kcal`,
		'baselineTdeeKcal', `program`.`baseline_tdee_kcal`,
		'goalType', `program`.`goal_type`,
		'targetWeightKg', `program`.`target_weight_kg`,
		'goalRatePctPerWeek', `program`.`goal_rate_pct_per_week`,
		'proteinGrams', `program`.`protein_grams`,
		'fatAllocationPct', `program`.`fat_allocation_pct`,
		'systemCalorieFloorKcal', `program`.`system_calorie_floor_kcal`,
		'userCalorieFloorKcal', `program`.`user_calorie_floor_kcal`,
		'algorithmVersion', `program`.`algorithm_version`
	),
	'migration',
	`program`.`updated_at`
FROM `adaptive_nutrition_programs` AS `program`;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_program_revisions_update_guard`
BEFORE UPDATE ON `adaptive_nutrition_program_revisions`
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition program revisions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_program_revisions_insert_sequence_guard`
BEFORE INSERT ON `adaptive_nutrition_program_revisions`
WHEN NEW.`sequence` <> coalesce((
	SELECT max(`revision`.`sequence`) + 1
	FROM `adaptive_nutrition_program_revisions` AS `revision`
	WHERE `revision`.`program_id` = NEW.`program_id`
), 1)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition program revisions require the next causal sequence');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_program_revisions_delete_guard`
BEFORE DELETE ON `adaptive_nutrition_program_revisions`
WHEN NOT EXISTS (
	SELECT 1 FROM `adaptive_nutrition_account_deletion_scope`
	WHERE `user_id` = OLD.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition program revisions may only be deleted in account deletion scope');
END;
