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
CREATE TRIGGER `template_exercises_exercise_scope_insert`
BEFORE INSERT ON `template_exercises`
WHEN NOT EXISTS (
  SELECT 1
  FROM `workout_templates` wt
  JOIN `exercises` e ON e.`id` = NEW.`exercise_id`
  WHERE wt.`id` = NEW.`template_id`
    AND (e.`user_id` IS NULL OR e.`user_id` = wt.`user_id`)
)
BEGIN
  SELECT RAISE(ABORT, 'invalid template_exercises exercise link');
END;
--> statement-breakpoint
CREATE TRIGGER `template_exercises_exercise_scope_update`
BEFORE UPDATE OF `template_id`, `exercise_id` ON `template_exercises`
WHEN NOT EXISTS (
  SELECT 1
  FROM `workout_templates` wt
  JOIN `exercises` e ON e.`id` = NEW.`exercise_id`
  WHERE wt.`id` = NEW.`template_id`
    AND (e.`user_id` IS NULL OR e.`user_id` = wt.`user_id`)
)
BEGIN
  SELECT RAISE(ABORT, 'invalid template_exercises exercise link');
END;
