CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`emoji` text,
	`tracking_type` text NOT NULL,
	`target` real,
	`unit` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "habits_tracking_type_check" CHECK("habits"."tracking_type" in ('boolean', 'numeric', 'time'))
);
--> statement-breakpoint
CREATE INDEX `habits_user_id_idx` ON `habits` (`user_id`);--> statement-breakpoint
CREATE TABLE `habit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`habit_id` text NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`value` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "habit_entries_date_format_check" CHECK("habit_entries"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `habit_entries_user_id_idx` ON `habit_entries` (`user_id`);--> statement-breakpoint
CREATE INDEX `habit_entries_date_idx` ON `habit_entries` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `habit_entries_habit_id_date_unique` ON `habit_entries` (`habit_id`,`date`);
