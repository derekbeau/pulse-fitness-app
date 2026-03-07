CREATE TABLE `health_conditions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`body_area` text NOT NULL,
	`status` text NOT NULL,
	`onset_date` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "health_conditions_status_check" CHECK("health_conditions"."status" in ('active', 'monitoring', 'resolved')),
	CONSTRAINT "health_conditions_onset_date_format_check" CHECK("health_conditions"."onset_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `health_conditions_user_id_idx` ON `health_conditions` (`user_id`);--> statement-breakpoint
CREATE TABLE `condition_protocols` (
	`id` text PRIMARY KEY NOT NULL,
	`condition_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`condition_id`) REFERENCES `health_conditions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "condition_protocols_status_check" CHECK("condition_protocols"."status" in ('active', 'discontinued', 'completed')),
	CONSTRAINT "condition_protocols_start_date_format_check" CHECK("condition_protocols"."start_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "condition_protocols_end_date_format_check" CHECK("condition_protocols"."end_date" is null or "condition_protocols"."end_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "condition_protocols_end_date_order_check" CHECK("condition_protocols"."end_date" is null or "condition_protocols"."end_date" >= "condition_protocols"."start_date")
);
--> statement-breakpoint
CREATE INDEX `condition_protocols_condition_id_idx` ON `condition_protocols` (`condition_id`);--> statement-breakpoint
CREATE TABLE `condition_severity_points` (
	`id` text PRIMARY KEY NOT NULL,
	`condition_id` text NOT NULL,
	`date` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`condition_id`) REFERENCES `health_conditions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "condition_severity_points_date_format_check" CHECK("condition_severity_points"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "condition_severity_points_value_check" CHECK("condition_severity_points"."value" between 1 and 10)
);
--> statement-breakpoint
CREATE INDEX `condition_severity_points_condition_date_idx` ON `condition_severity_points` (`condition_id`,`date`);--> statement-breakpoint
CREATE TABLE `condition_timeline_events` (
	`id` text PRIMARY KEY NOT NULL,
	`condition_id` text NOT NULL,
	`date` text NOT NULL,
	`event` text NOT NULL,
	`type` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`condition_id`) REFERENCES `health_conditions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "condition_timeline_events_date_format_check" CHECK("condition_timeline_events"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "condition_timeline_events_type_check" CHECK("condition_timeline_events"."type" in ('onset', 'flare', 'improvement', 'treatment', 'milestone'))
);
--> statement-breakpoint
CREATE INDEX `condition_timeline_events_condition_date_idx` ON `condition_timeline_events` (`condition_id`,`date`);
