CREATE TABLE `body_progress_photo_deletion_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`quarantine_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `body_progress_photo_deletion_intents_scope_check` CHECK(`scope` in ('photo','set','all','account'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_progress_photo_deletion_intents_storage_key_unique` ON `body_progress_photo_deletion_intents` (`storage_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `body_progress_photo_deletion_intents_quarantine_key_unique` ON `body_progress_photo_deletion_intents` (`quarantine_key`);--> statement-breakpoint
CREATE INDEX `body_progress_photo_deletion_intents_scope_idx` ON `body_progress_photo_deletion_intents` (`user_id`,`scope`,`scope_id`);
