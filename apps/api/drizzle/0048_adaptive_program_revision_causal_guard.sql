DROP TRIGGER `adaptive_nutrition_program_revisions_update_guard`;
--> statement-breakpoint
UPDATE `adaptive_nutrition_program_revisions` AS `current`
SET `effective_at` = (
	SELECT max(`prior`.`effective_at`)
	FROM `adaptive_nutrition_program_revisions` AS `prior`
	WHERE `prior`.`program_id` = `current`.`program_id`
		AND `prior`.`sequence` <= `current`.`sequence`
)
WHERE `current`.`effective_at` < (
	SELECT max(`prior`.`effective_at`)
	FROM `adaptive_nutrition_program_revisions` AS `prior`
	WHERE `prior`.`program_id` = `current`.`program_id`
		AND `prior`.`sequence` <= `current`.`sequence`
);
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_program_revisions_update_guard`
BEFORE UPDATE ON `adaptive_nutrition_program_revisions`
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition program revisions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_program_revisions_insert_effective_at_guard`
BEFORE INSERT ON `adaptive_nutrition_program_revisions`
WHEN NEW.`effective_at` < coalesce((
	SELECT max(`revision`.`effective_at`)
	FROM `adaptive_nutrition_program_revisions` AS `revision`
	WHERE `revision`.`program_id` = NEW.`program_id`
), NEW.`effective_at`)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition program revisions require nondecreasing effective_at');
END;
