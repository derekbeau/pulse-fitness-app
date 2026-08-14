ALTER TABLE `adaptive_nutrition_goals` ADD `final_trend_weight_kg` real;
--> statement-breakpoint
DROP TRIGGER `adaptive_nutrition_goals_immutable_fields_guard`;
--> statement-breakpoint
UPDATE `adaptive_nutrition_goals`
SET `final_trend_weight_kg` = COALESCE(
  (
    SELECT CAST(json_extract(`checkin`.`calculation_snapshot`, '$.latestTrendWeightKg') AS real)
    FROM `adaptive_nutrition_checkins` AS `checkin`
    WHERE `checkin`.`goal_id` = `adaptive_nutrition_goals`.`id`
      AND `checkin`.`user_id` = `adaptive_nutrition_goals`.`user_id`
      AND `checkin`.`status` = 'accepted'
      AND json_type(`checkin`.`calculation_snapshot`, '$.latestTrendWeightKg') IN ('integer', 'real')
    ORDER BY `checkin`.`resolved_at` DESC, `checkin`.`created_at` DESC
    LIMIT 1
  ),
  `start_trend_weight_kg`
)
WHERE `status` <> 'active';
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_checkins_id_user_id_unique`
ON `adaptive_nutrition_checkins` (`id`, `user_id`);
--> statement-breakpoint
CREATE TABLE `adaptive_nutrition_goal_completions` (
	`check_in_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`completed_goal_id` text NOT NULL,
	`maintenance_goal_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`check_in_id`) REFERENCES `adaptive_nutrition_checkins`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_goal_id`) REFERENCES `adaptive_nutrition_goals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`maintenance_goal_id`) REFERENCES `adaptive_nutrition_goals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`check_in_id`,`user_id`) REFERENCES `adaptive_nutrition_checkins`(`id`,`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`completed_goal_id`,`user_id`) REFERENCES `adaptive_nutrition_goals`(`id`,`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`maintenance_goal_id`,`user_id`) REFERENCES `adaptive_nutrition_goals`(`id`,`user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `adaptive_nutrition_goal_completions_distinct_goals_check` CHECK(`completed_goal_id` <> `maintenance_goal_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_goal_completions_completed_goal_unique`
ON `adaptive_nutrition_goal_completions` (`completed_goal_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_goal_completions_maintenance_goal_unique`
ON `adaptive_nutrition_goal_completions` (`maintenance_goal_id`);
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_goals_immutable_fields_guard`
BEFORE UPDATE ON `adaptive_nutrition_goals`
WHEN
	OLD.`status` <> 'active'
	OR NEW.`id` IS NOT OLD.`id`
	OR NEW.`user_id` IS NOT OLD.`user_id`
	OR NEW.`program_id` IS NOT OLD.`program_id`
	OR NEW.`type` IS NOT OLD.`type`
	OR NEW.`start_trend_weight_kg` IS NOT OLD.`start_trend_weight_kg`
	OR NEW.`start_scale_weight_kg` IS NOT OLD.`start_scale_weight_kg`
	OR NEW.`started_local_date` IS NOT OLD.`started_local_date`
	OR NEW.`created_at` IS NOT OLD.`created_at`
	OR (
		NEW.`final_trend_weight_kg` IS NOT OLD.`final_trend_weight_kg`
		AND NOT (
			OLD.`final_trend_weight_kg` IS NULL
			AND NEW.`final_trend_weight_kg` IS NOT NULL
			AND NEW.`status` <> 'active'
		)
	)
	OR (NEW.`status` = 'active' AND NEW.`final_trend_weight_kg` IS NOT NULL)
	OR (NEW.`status` <> 'active' AND NEW.`final_trend_weight_kg` IS NULL)
BEGIN
	SELECT RAISE(ABORT, 'closed goals, progress origins, and final trends are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_goals_final_trend_insert_guard`
BEFORE INSERT ON `adaptive_nutrition_goals`
WHEN
	(NEW.`status` = 'active' AND NEW.`final_trend_weight_kg` IS NOT NULL)
	OR (NEW.`status` <> 'active' AND NEW.`final_trend_weight_kg` IS NULL)
BEGIN
	SELECT RAISE(ABORT, 'active goals cannot have final trends and closed goals require them');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_goal_revisions_insert_guard`
BEFORE INSERT ON `adaptive_nutrition_goal_revisions`
WHEN
	NOT EXISTS (
		SELECT 1 FROM `adaptive_nutrition_goals` AS `goal`
		WHERE `goal`.`id` = NEW.`goal_id`
			AND `goal`.`user_id` = NEW.`user_id`
			AND `goal`.`status` = 'active'
	)
	OR NEW.`sequence` <> COALESCE((
		SELECT MAX(`revision`.`sequence`) + 1
		FROM `adaptive_nutrition_goal_revisions` AS `revision`
		WHERE `revision`.`goal_id` = NEW.`goal_id`
	), 1)
	OR NOT EXISTS (
		SELECT 1 FROM `adaptive_nutrition_goals` AS `goal`
		WHERE `goal`.`id` = NEW.`goal_id`
			AND `goal`.`user_id` = NEW.`user_id`
			AND (
				(
					NEW.`sequence` = 1
					AND NEW.`target_weight_kg` IS `goal`.`target_weight_kg`
					AND NEW.`maintenance_center_kg` IS `goal`.`maintenance_center_kg`
					AND NEW.`goal_rate_pct_per_week` IS `goal`.`goal_rate_pct_per_week`
				)
				OR (
					NEW.`sequence` > 1
					AND NEW.`reason` = 'user_edit'
					AND NEW.`previous_target_weight_kg` IS `goal`.`target_weight_kg`
					AND NEW.`previous_center_kg` IS `goal`.`maintenance_center_kg`
					AND NEW.`previous_rate_pct_per_week` IS `goal`.`goal_rate_pct_per_week`
				)
			)
	)
BEGIN
	SELECT RAISE(ABORT, 'goal revisions must be the matching next strategy revision');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_goal_revisions_apply_strategy`
AFTER INSERT ON `adaptive_nutrition_goal_revisions`
WHEN NEW.`sequence` > 1
BEGIN
	UPDATE `adaptive_nutrition_goals`
	SET `target_weight_kg` = NEW.`target_weight_kg`,
		`maintenance_center_kg` = NEW.`maintenance_center_kg`,
		`goal_rate_pct_per_week` = NEW.`goal_rate_pct_per_week`,
		`updated_at` = NEW.`created_at`
	WHERE `id` = NEW.`goal_id`
		AND `user_id` = NEW.`user_id`
		AND `status` = 'active';
	SELECT CASE WHEN changes() <> 1
		THEN RAISE(ABORT, 'goal revision did not update exactly one active goal') END;
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_goals_strategy_revision_guard`
BEFORE UPDATE ON `adaptive_nutrition_goals`
WHEN
	NEW.`target_weight_kg` IS NOT OLD.`target_weight_kg`
	OR NEW.`maintenance_center_kg` IS NOT OLD.`maintenance_center_kg`
	OR NEW.`goal_rate_pct_per_week` IS NOT OLD.`goal_rate_pct_per_week`
BEGIN
	SELECT CASE WHEN (
		SELECT COUNT(*)
		FROM `adaptive_nutrition_goal_revisions` AS `revision`
		WHERE `revision`.`goal_id` = OLD.`id`
			AND `revision`.`user_id` = OLD.`user_id`
			AND `revision`.`target_weight_kg` IS NEW.`target_weight_kg`
			AND `revision`.`maintenance_center_kg` IS NEW.`maintenance_center_kg`
			AND `revision`.`goal_rate_pct_per_week` IS NEW.`goal_rate_pct_per_week`
			AND `revision`.`previous_target_weight_kg` IS OLD.`target_weight_kg`
			AND `revision`.`previous_center_kg` IS OLD.`maintenance_center_kg`
			AND `revision`.`previous_rate_pct_per_week` IS OLD.`goal_rate_pct_per_week`
			AND `revision`.`sequence` = (
				SELECT MAX(`latest`.`sequence`)
				FROM `adaptive_nutrition_goal_revisions` AS `latest`
				WHERE `latest`.`goal_id` = OLD.`id`
			)
	) <> 1 THEN RAISE(ABORT, 'goal strategy changes require exactly one matching next revision') END;
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_goal_completions_insert_guard`
BEFORE INSERT ON `adaptive_nutrition_goal_completions`
WHEN NOT EXISTS (
	SELECT 1
	FROM `adaptive_nutrition_checkins` AS `checkin`
	JOIN `adaptive_nutrition_goals` AS `completed`
		ON `completed`.`id` = NEW.`completed_goal_id`
	JOIN `adaptive_nutrition_goals` AS `maintenance`
		ON `maintenance`.`id` = NEW.`maintenance_goal_id`
	WHERE `checkin`.`id` = NEW.`check_in_id`
		AND `checkin`.`user_id` = NEW.`user_id`
		AND `checkin`.`status` = 'accepted'
		AND `checkin`.`goal_id` = `completed`.`id`
		AND `completed`.`user_id` = NEW.`user_id`
		AND `completed`.`status` = 'completed'
		AND `maintenance`.`user_id` = NEW.`user_id`
		AND `maintenance`.`status` = 'active'
		AND `maintenance`.`type` = 'maintain'
		AND `maintenance`.`program_id` = `completed`.`program_id`
)
BEGIN
	SELECT RAISE(ABORT, 'goal completion must link one accepted check-in and its completed and maintenance goals');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_goal_completions_update_guard`
BEFORE UPDATE ON `adaptive_nutrition_goal_completions`
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition goal completion relations are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_goal_completions_delete_guard`
BEFORE DELETE ON `adaptive_nutrition_goal_completions`
WHEN NOT EXISTS (
	SELECT 1 FROM `adaptive_nutrition_account_deletion_scope`
	WHERE `user_id` = OLD.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition goal completion relations may only be deleted in account deletion scope');
END;
