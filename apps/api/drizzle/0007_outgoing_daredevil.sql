CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "activities_date_format_check" CHECK("activities"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "activities_type_check" CHECK("activities"."type" in ('walking', 'running', 'stretching', 'yoga', 'cycling', 'swimming', 'hiking', 'other')),
	CONSTRAINT "activities_duration_minutes_check" CHECK("activities"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE INDEX `activities_user_date_idx` ON `activities` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "journal_entries_date_format_check" CHECK("journal_entries"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "journal_entries_type_check" CHECK("journal_entries"."type" in ('post-workout', 'milestone', 'observation', 'weekly-summary', 'injury-update')),
	CONSTRAINT "journal_entries_created_by_check" CHECK("journal_entries"."created_by" in ('agent', 'user'))
);
--> statement-breakpoint
CREATE INDEX `journal_entries_user_date_idx` ON `journal_entries` (`user_id`,`date`);