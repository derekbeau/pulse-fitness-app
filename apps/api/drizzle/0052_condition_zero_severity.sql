CREATE TABLE `__new_condition_severity_points` (
	`id` text PRIMARY KEY NOT NULL,
	`condition_id` text NOT NULL,
	`date` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`condition_id`) REFERENCES `health_conditions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "condition_severity_points_date_format_check" CHECK("__new_condition_severity_points"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "condition_severity_points_value_check" CHECK("__new_condition_severity_points"."value" between 0 and 10)
);
--> statement-breakpoint
INSERT INTO `__new_condition_severity_points` (`id`, `condition_id`, `date`, `value`, `created_at`)
SELECT `id`, `condition_id`, `date`, `value`, `created_at` FROM `condition_severity_points`;
--> statement-breakpoint
DROP TABLE `condition_severity_points`;
--> statement-breakpoint
ALTER TABLE `__new_condition_severity_points` RENAME TO `condition_severity_points`;
--> statement-breakpoint
CREATE INDEX `condition_severity_points_condition_date_idx` ON `condition_severity_points` (`condition_id`,`date`);
