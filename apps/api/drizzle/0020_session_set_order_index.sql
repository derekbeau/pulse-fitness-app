ALTER TABLE session_sets ADD COLUMN order_index integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE session_sets AS target
SET order_index = (
  SELECT count(DISTINCT source.exercise_id) - 1
  FROM session_sets AS source
  WHERE source.session_id = target.session_id
    AND coalesce(source.section, 'main') = coalesce(target.section, 'main')
    AND source.exercise_id <= target.exercise_id
);
