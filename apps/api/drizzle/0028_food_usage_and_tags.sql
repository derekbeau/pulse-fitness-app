ALTER TABLE `foods` ADD `usage_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `foods` ADD `tags` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE INDEX `foods_user_usage_count_idx` ON `foods` (`user_id`,`usage_count`);
