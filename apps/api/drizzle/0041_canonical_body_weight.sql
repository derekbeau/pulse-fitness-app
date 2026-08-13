PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TEMP TABLE IF NOT EXISTS `body_weight_legacy_unit_map` (
	`user_id` text PRIMARY KEY NOT NULL,
	`unit` text NOT NULL CHECK (`unit` IN ('lbs', 'kg'))
);--> statement-breakpoint
DROP TABLE IF EXISTS temp.`body_weight_migration_guard`;--> statement-breakpoint
CREATE TEMP TABLE `body_weight_migration_guard` (
	`valid` integer NOT NULL CHECK (`valid` = 1)
);--> statement-breakpoint
INSERT INTO temp.`body_weight_migration_guard` (`valid`)
SELECT CASE
	WHEN EXISTS (
		SELECT 1
		FROM `body_weight`
		LEFT JOIN temp.`body_weight_legacy_unit_map` AS `migration_map`
			ON `migration_map`.`user_id` = `body_weight`.`user_id`
		WHERE `migration_map`.`user_id` IS NULL
	)
	OR EXISTS (
		SELECT 1
		FROM temp.`body_weight_legacy_unit_map` AS `migration_map`
		LEFT JOIN `body_weight`
			ON `body_weight`.`user_id` = `migration_map`.`user_id`
		WHERE `body_weight`.`user_id` IS NULL
	)
	THEN 0
	ELSE 1
END;--> statement-breakpoint
CREATE TABLE `__new_body_weight` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`weight` real NOT NULL,
	`weight_kg` real NOT NULL,
	`unit_at_entry` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "body_weight_date_format_check" CHECK("__new_body_weight"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "body_weight_weight_check" CHECK("__new_body_weight"."weight" > 0),
	CONSTRAINT "body_weight_weight_kg_check" CHECK("__new_body_weight"."weight_kg" between 25 and 350),
	CONSTRAINT "body_weight_unit_at_entry_check" CHECK("__new_body_weight"."unit_at_entry" in ('lbs', 'kg')),
	CONSTRAINT "body_weight_legacy_pounds_check" CHECK(abs("__new_body_weight"."weight" - ("__new_body_weight"."weight_kg" / 0.45359237)) < 0.000001)
);
--> statement-breakpoint
INSERT INTO `__new_body_weight`(
	"id",
	"user_id",
	"date",
	"weight",
	"weight_kg",
	"unit_at_entry",
	"notes",
	"created_at",
	"updated_at"
)
SELECT
	`body_weight`.`id`,
	`body_weight`.`user_id`,
	`body_weight`.`date`,
	CASE `migration_map`.`unit`
		WHEN 'lbs' THEN `body_weight`.`weight`
		ELSE `body_weight`.`weight` / 0.45359237
	END,
	CASE `migration_map`.`unit`
		WHEN 'lbs' THEN `body_weight`.`weight` * 0.45359237
		ELSE `body_weight`.`weight`
	END,
	`migration_map`.`unit`,
	`body_weight`.`notes`,
	`body_weight`.`created_at`,
	`body_weight`.`updated_at`
FROM `body_weight`
INNER JOIN temp.`body_weight_legacy_unit_map` AS `migration_map`
	ON `migration_map`.`user_id` = `body_weight`.`user_id`;--> statement-breakpoint
DROP TABLE `body_weight`;--> statement-breakpoint
ALTER TABLE `__new_body_weight` RENAME TO `body_weight`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `body_weight_user_id_date_unique` ON `body_weight` (`user_id`,`date`);--> statement-breakpoint
DROP TABLE temp.`body_weight_migration_guard`;--> statement-breakpoint
DROP TABLE temp.`body_weight_legacy_unit_map`;
