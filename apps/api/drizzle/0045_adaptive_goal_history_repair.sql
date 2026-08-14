DROP TRIGGER `adaptive_nutrition_goals_immutable_fields_guard`;
--> statement-breakpoint
DROP TRIGGER `adaptive_nutrition_goal_completions_insert_guard`;
--> statement-breakpoint
UPDATE `adaptive_nutrition_goals`
SET `final_trend_weight_kg` = CASE
	WHEN `status` IN ('replaced', 'completed') THEN (
		SELECT MIN(`successor`.`start_trend_weight_kg`)
		FROM `adaptive_nutrition_goals` AS `successor`
		JOIN `adaptive_nutrition_goal_revisions` AS `successor_revision`
			ON `successor_revision`.`goal_id` = `successor`.`id`
			AND `successor_revision`.`user_id` = `successor`.`user_id`
			AND `successor_revision`.`sequence` = 1
		WHERE `successor`.`user_id` = `adaptive_nutrition_goals`.`user_id`
			AND `successor`.`program_id` = `adaptive_nutrition_goals`.`program_id`
			AND `successor`.`id` <> `adaptive_nutrition_goals`.`id`
			AND `successor`.`created_at` = `adaptive_nutrition_goals`.`updated_at`
			AND `successor`.`started_local_date` = `adaptive_nutrition_goals`.`ended_local_date`
			AND (
				(`adaptive_nutrition_goals`.`status` = 'replaced'
					AND `successor_revision`.`reason` = 'created')
				OR (`adaptive_nutrition_goals`.`status` = 'completed'
					AND `successor`.`type` = 'maintain'
					AND `successor_revision`.`reason` = 'goal_completion')
			)
			AND (
				SELECT COUNT(DISTINCT `candidate`.`start_trend_weight_kg`)
				FROM `adaptive_nutrition_goals` AS `candidate`
				JOIN `adaptive_nutrition_goal_revisions` AS `candidate_revision`
					ON `candidate_revision`.`goal_id` = `candidate`.`id`
					AND `candidate_revision`.`user_id` = `candidate`.`user_id`
					AND `candidate_revision`.`sequence` = 1
				WHERE `candidate`.`user_id` = `adaptive_nutrition_goals`.`user_id`
					AND `candidate`.`program_id` = `adaptive_nutrition_goals`.`program_id`
					AND `candidate`.`id` <> `adaptive_nutrition_goals`.`id`
					AND `candidate`.`created_at` = `adaptive_nutrition_goals`.`updated_at`
					AND `candidate`.`started_local_date` = `adaptive_nutrition_goals`.`ended_local_date`
					AND (
						(`adaptive_nutrition_goals`.`status` = 'replaced'
							AND `candidate_revision`.`reason` = 'created')
						OR (`adaptive_nutrition_goals`.`status` = 'completed'
							AND `candidate`.`type` = 'maintain'
							AND `candidate_revision`.`reason` = 'goal_completion')
					)
			) = 1
	)
	WHEN `status` = 'cancelled' THEN (
		SELECT CAST(json_extract(`checkin`.`calculation_snapshot`, '$.latestTrendWeightKg') AS real)
		FROM `adaptive_nutrition_checkins` AS `checkin`
		WHERE `checkin`.`goal_id` = `adaptive_nutrition_goals`.`id`
			AND `checkin`.`user_id` = `adaptive_nutrition_goals`.`user_id`
			AND `checkin`.`status` = 'accepted'
			AND `checkin`.`resolved_at` = `adaptive_nutrition_goals`.`updated_at`
			AND json_type(`checkin`.`calculation_snapshot`, '$.latestTrendWeightKg') IN ('integer', 'real')
			AND (
				SELECT COUNT(*)
				FROM `adaptive_nutrition_checkins` AS `candidate_checkin`
				WHERE `candidate_checkin`.`goal_id` = `adaptive_nutrition_goals`.`id`
					AND `candidate_checkin`.`user_id` = `adaptive_nutrition_goals`.`user_id`
					AND `candidate_checkin`.`status` = 'accepted'
					AND `candidate_checkin`.`resolved_at` = `adaptive_nutrition_goals`.`updated_at`
					AND json_type(`candidate_checkin`.`calculation_snapshot`, '$.latestTrendWeightKg') IN ('integer', 'real')
			) = 1
	)
END
WHERE `status` <> 'active';
--> statement-breakpoint
CREATE TABLE `__adaptive_goal_final_trend_backfill_guard` (
	`blocked_rows` integer NOT NULL CHECK (`blocked_rows` = 0)
);
--> statement-breakpoint
INSERT INTO `__adaptive_goal_final_trend_backfill_guard` (`blocked_rows`)
SELECT COUNT(*)
FROM `adaptive_nutrition_goals`
WHERE `status` <> 'active'
	AND `final_trend_weight_kg` IS NULL;
--> statement-breakpoint
DROP TABLE `__adaptive_goal_final_trend_backfill_guard`;
--> statement-breakpoint
INSERT INTO `adaptive_nutrition_goal_completions` (
	`check_in_id`, `user_id`, `completed_goal_id`, `maintenance_goal_id`, `created_at`
)
SELECT
	`checkin`.`id`,
	`completed`.`user_id`,
	`completed`.`id`,
	`maintenance`.`id`,
	`completed`.`updated_at`
FROM `adaptive_nutrition_goals` AS `completed`
JOIN `adaptive_nutrition_goals` AS `maintenance`
	ON `maintenance`.`user_id` = `completed`.`user_id`
	AND `maintenance`.`program_id` = `completed`.`program_id`
	AND `maintenance`.`id` <> `completed`.`id`
	AND `maintenance`.`type` = 'maintain'
	AND `maintenance`.`created_at` = `completed`.`updated_at`
	AND `maintenance`.`started_local_date` = `completed`.`ended_local_date`
JOIN `adaptive_nutrition_goal_revisions` AS `maintenance_revision`
	ON `maintenance_revision`.`goal_id` = `maintenance`.`id`
	AND `maintenance_revision`.`user_id` = `maintenance`.`user_id`
	AND `maintenance_revision`.`sequence` = 1
	AND `maintenance_revision`.`reason` = 'goal_completion'
JOIN `adaptive_nutrition_checkins` AS `checkin`
	ON `checkin`.`goal_id` = `completed`.`id`
	AND `checkin`.`user_id` = `completed`.`user_id`
	AND `checkin`.`status` = 'accepted'
	AND json_extract(`checkin`.`calculation_snapshot`, '$.goal.goalReached') = 1
	AND json_type(`checkin`.`calculation_snapshot`, '$.latestTrendWeightKg') IN ('integer', 'real')
	AND CAST(json_extract(`checkin`.`calculation_snapshot`, '$.latestTrendWeightKg') AS real)
		= `maintenance`.`start_trend_weight_kg`
WHERE `completed`.`status` = 'completed'
	AND `completed`.`final_trend_weight_kg` = `maintenance`.`start_trend_weight_kg`
	AND NOT EXISTS (
		SELECT 1 FROM `adaptive_nutrition_goal_completions` AS `existing`
		WHERE `existing`.`completed_goal_id` = `completed`.`id`
			OR `existing`.`maintenance_goal_id` = `maintenance`.`id`
			OR `existing`.`check_in_id` = `checkin`.`id`
	)
	AND (
		SELECT COUNT(*)
		FROM `adaptive_nutrition_goals` AS `candidate`
		JOIN `adaptive_nutrition_goal_revisions` AS `candidate_revision`
			ON `candidate_revision`.`goal_id` = `candidate`.`id`
			AND `candidate_revision`.`user_id` = `candidate`.`user_id`
			AND `candidate_revision`.`sequence` = 1
			AND `candidate_revision`.`reason` = 'goal_completion'
		WHERE `candidate`.`user_id` = `completed`.`user_id`
			AND `candidate`.`program_id` = `completed`.`program_id`
			AND `candidate`.`id` <> `completed`.`id`
			AND `candidate`.`type` = 'maintain'
			AND `candidate`.`created_at` = `completed`.`updated_at`
			AND `candidate`.`started_local_date` = `completed`.`ended_local_date`
	) = 1
	AND (
		SELECT COUNT(*)
		FROM `adaptive_nutrition_checkins` AS `candidate_checkin`
		WHERE `candidate_checkin`.`goal_id` = `completed`.`id`
			AND `candidate_checkin`.`user_id` = `completed`.`user_id`
			AND `candidate_checkin`.`status` = 'accepted'
			AND json_extract(`candidate_checkin`.`calculation_snapshot`, '$.goal.goalReached') = 1
			AND json_type(`candidate_checkin`.`calculation_snapshot`, '$.latestTrendWeightKg') IN ('integer', 'real')
			AND CAST(json_extract(`candidate_checkin`.`calculation_snapshot`, '$.latestTrendWeightKg') AS real)
				= `maintenance`.`start_trend_weight_kg`
	) = 1;
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
