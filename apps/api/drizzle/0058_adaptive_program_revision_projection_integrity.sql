CREATE TABLE `adaptive_nutrition_program_revision_projection_integrity` (
	`program_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`projection_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `adaptive_nutrition_programs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_program_revision_projection_integrity_program_user_fk`
		FOREIGN KEY (`program_id`,`user_id`)
		REFERENCES `adaptive_nutrition_programs`(`id`,`user_id`)
		ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_program_revision_projection_integrity_count_check`
		CHECK (`projection_count` >= 0)
);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_program_revision_projection_integrity_user_id_idx`
	ON `adaptive_nutrition_program_revision_projection_integrity` (`user_id`);
--> statement-breakpoint
INSERT INTO `adaptive_nutrition_program_revision_projection_integrity` (`program_id`, `user_id`, `projection_count`)
SELECT `program`.`id`,
       `program`.`user_id`,
       count(`projection`.`revision_id`)
FROM `adaptive_nutrition_programs` AS `program`
LEFT JOIN `adaptive_nutrition_program_revision_dates` AS `projection`
  ON `projection`.`program_id` = `program`.`id`
 AND `projection`.`user_id` = `program`.`user_id`
GROUP BY `program`.`id`, `program`.`user_id`;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_program_revision_projection_integrity_insert`
AFTER INSERT ON `adaptive_nutrition_program_revision_dates`
BEGIN
	INSERT INTO `adaptive_nutrition_program_revision_projection_integrity`
		(`program_id`, `user_id`, `projection_count`)
	VALUES (NEW.`program_id`, NEW.`user_id`, 1)
	ON CONFLICT (`program_id`) DO UPDATE
	SET `projection_count` = `projection_count` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_program_revision_projection_integrity_delete`
AFTER DELETE ON `adaptive_nutrition_program_revision_dates`
BEGIN
	UPDATE `adaptive_nutrition_program_revision_projection_integrity`
	SET `projection_count` = `projection_count` - 1
	WHERE `program_id` = OLD.`program_id`
	  AND `user_id` = OLD.`user_id`;
END;
