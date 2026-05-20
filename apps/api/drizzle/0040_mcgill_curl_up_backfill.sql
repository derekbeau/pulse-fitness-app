UPDATE `session_sets`
SET
  `seconds` = `reps`,
  `reps` = 1,
  `target_seconds` = coalesce(`target_seconds`, 10)
WHERE
  `exercise_id` IN (
    SELECT `id`
    FROM `exercises`
    WHERE `name` = 'McGill Curl-Up' AND `tracking_type` = 'reps_seconds'
  )
  AND `seconds` IS NULL
  AND `reps` IS NOT NULL;
--> statement-breakpoint
UPDATE `session_sets`
SET `target_seconds` = 10
WHERE
  `exercise_id` IN (
    SELECT `id`
    FROM `exercises`
    WHERE `name` = 'McGill Curl-Up' AND `tracking_type` = 'reps_seconds'
  )
  AND `target_seconds` IS NULL;
--> statement-breakpoint
UPDATE `template_exercises`
SET
  `reps_min` = 1,
  `reps_max` = 1,
  `set_targets` = '[{"setNumber":1,"targetSeconds":10},{"setNumber":2,"targetSeconds":10}]'
WHERE
  `exercise_id` IN (
    SELECT `id`
    FROM `exercises`
    WHERE `name` = 'McGill Curl-Up' AND `tracking_type` = 'reps_seconds'
  )
  AND (`set_targets` IS NULL OR `set_targets` = '')
  AND `reps_min` = 10
  AND `reps_max` = 10;
