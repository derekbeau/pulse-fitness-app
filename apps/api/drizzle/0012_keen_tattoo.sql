PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_habits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`emoji` text,
	`tracking_type` text NOT NULL,
	`target` real,
	`unit` text,
	`frequency` text DEFAULT 'daily' NOT NULL,
	`frequency_target` integer,
	`scheduled_days` text,
	`paused_until` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "habits_tracking_type_check" CHECK("__new_habits"."tracking_type" in ('boolean', 'numeric', 'time')),
	CONSTRAINT "habits_frequency_check" CHECK("__new_habits"."frequency" in ('daily', 'weekly', 'specific_days'))
);
--> statement-breakpoint
INSERT INTO `__new_habits`("id", "user_id", "name", "emoji", "tracking_type", "target", "unit", "frequency", "frequency_target", "scheduled_days", "paused_until", "sort_order", "active", "created_at", "updated_at") SELECT "id", "user_id", "name", "emoji", "tracking_type", "target", "unit", 'daily', NULL, NULL, NULL, "sort_order", "active", "created_at", "updated_at" FROM `habits`;--> statement-breakpoint
DROP TABLE `habits`;--> statement-breakpoint
ALTER TABLE `__new_habits` RENAME TO `habits`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `habits_user_id_idx` ON `habits` (`user_id`);
