CREATE TABLE `adaptive_nutrition_program_revision_dates` (
	`revision_id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`user_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`effective_local_date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`revision_id`) REFERENCES `adaptive_nutrition_program_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `adaptive_nutrition_programs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_program_revision_dates_program_user_fk`
		FOREIGN KEY (`program_id`,`user_id`)
		REFERENCES `adaptive_nutrition_programs`(`id`,`user_id`)
		ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `adaptive_nutrition_program_revision_dates_sequence_check` CHECK (`sequence` >= 1),
	CONSTRAINT `adaptive_nutrition_program_revision_dates_date_check`
		CHECK (`effective_local_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `adaptive_nutrition_program_revision_dates_lookup_idx`
	ON `adaptive_nutrition_program_revision_dates` (`user_id`,`program_id`,`effective_local_date`,`sequence`);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_nutrition_program_revision_dates_program_sequence_unique`
	ON `adaptive_nutrition_program_revision_dates` (`program_id`,`sequence`);
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_program_revision_dates_insert_identity_guard`
BEFORE INSERT ON `adaptive_nutrition_program_revision_dates`
WHEN NOT EXISTS (
	SELECT 1
	FROM `adaptive_nutrition_program_revisions` AS `revision`
	WHERE `revision`.`id` = NEW.`revision_id`
		AND `revision`.`program_id` = NEW.`program_id`
		AND `revision`.`user_id` = NEW.`user_id`
		AND `revision`.`sequence` = NEW.`sequence`
)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition program revision projection identity mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_program_revision_dates_insert_sequence_guard`
BEFORE INSERT ON `adaptive_nutrition_program_revision_dates`
WHEN NEW.`sequence` <> coalesce((
	SELECT max(`projection`.`sequence`) + 1
	FROM `adaptive_nutrition_program_revision_dates` AS `projection`
	WHERE `projection`.`program_id` = NEW.`program_id`
), 1)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition program revision projection requires the next causal sequence');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_program_revision_dates_insert_date_guard`
BEFORE INSERT ON `adaptive_nutrition_program_revision_dates`
WHEN NEW.`effective_local_date` < coalesce((
	SELECT max(`projection`.`effective_local_date`)
	FROM `adaptive_nutrition_program_revision_dates` AS `projection`
	WHERE `projection`.`program_id` = NEW.`program_id`
), NEW.`effective_local_date`)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition program revision projection dates must be nondecreasing');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_program_revision_dates_update_guard`
BEFORE UPDATE ON `adaptive_nutrition_program_revision_dates`
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition program revision projections are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `adaptive_nutrition_program_revision_dates_delete_guard`
BEFORE DELETE ON `adaptive_nutrition_program_revision_dates`
WHEN NOT EXISTS (
	SELECT 1 FROM `adaptive_nutrition_account_deletion_scope`
	WHERE `user_id` = OLD.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'adaptive nutrition program revision projections may only be deleted in account deletion scope');
END;
