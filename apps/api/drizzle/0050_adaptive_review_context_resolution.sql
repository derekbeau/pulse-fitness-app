ALTER TABLE `adaptive_nutrition_review_contexts`
ADD COLUMN `resolution_kind` text
CHECK (`resolution_kind` is null or (`resolution_kind` = 'nutrition_complete' and `resolution` is not null));
--> statement-breakpoint
DROP TRIGGER `adaptive_nutrition_review_contexts_update_guard`;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_review_contexts_update_guard`
BEFORE UPDATE ON `adaptive_nutrition_review_contexts`
WHEN NEW.`id` <> OLD.`id`
	OR NEW.`user_id` <> OLD.`user_id`
	OR NEW.`program_id` <> OLD.`program_id`
	OR NEW.`subject_type` <> OLD.`subject_type`
	OR NEW.`subject` <> OLD.`subject`
	OR NEW.`created_by` <> OLD.`created_by`
	OR coalesce(NEW.`agent_token_id`, '') <> coalesce(OLD.`agent_token_id`, '')
	OR NEW.`actor_label` <> OLD.`actor_label`
	OR NEW.`created_at` <> OLD.`created_at`
	OR NEW.`revision` <> OLD.`revision` + 1
	OR OLD.`deleted_at` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition review context update violates optimistic revision contract');
END;
