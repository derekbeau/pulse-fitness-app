DROP TRIGGER `workout_progression_recommendations_update_guard`;
--> statement-breakpoint
UPDATE `workout_progression_recommendations`
SET `snapshot` = json_set(
  `snapshot`,
  '$.evidence.priority',
  (
    SELECT json_extract(`configuration`.`snapshot`, '$.priority')
    FROM `workout_progression_configurations` AS `configuration`
    WHERE `configuration`.`id` = json_extract(
            `workout_progression_recommendations`.`snapshot`,
            '$.evidence.policySource.configurationId'
          )
      AND `configuration`.`revision` = json_extract(
            `workout_progression_recommendations`.`snapshot`,
            '$.evidence.policySource.revision'
          )
      AND `configuration`.`scheduled_workout_exercise_id` = `workout_progression_recommendations`.`scheduled_workout_exercise_id`
      AND `configuration`.`user_id` = `workout_progression_recommendations`.`user_id`
    LIMIT 1
  )
)
WHERE json_extract(`snapshot`, '$.evidence.priority') IS NULL
  AND EXISTS (
    SELECT 1
    FROM `workout_progression_configurations` AS `configuration`
    WHERE `configuration`.`id` = json_extract(
            `workout_progression_recommendations`.`snapshot`,
            '$.evidence.policySource.configurationId'
          )
      AND `configuration`.`revision` = json_extract(
            `workout_progression_recommendations`.`snapshot`,
            '$.evidence.policySource.revision'
          )
      AND `configuration`.`scheduled_workout_exercise_id` = `workout_progression_recommendations`.`scheduled_workout_exercise_id`
      AND `configuration`.`user_id` = `workout_progression_recommendations`.`user_id`
  );
--> statement-breakpoint
CREATE TRIGGER `workout_progression_recommendations_update_guard`
BEFORE UPDATE ON `workout_progression_recommendations`
BEGIN SELECT RAISE(ABORT, 'workout progression recommendations are immutable'); END;
