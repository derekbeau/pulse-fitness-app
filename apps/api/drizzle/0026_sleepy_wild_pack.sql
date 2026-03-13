ALTER TABLE `exercises` ADD `coaching_notes` text;--> statement-breakpoint
ALTER TABLE `exercises` ADD `related_exercise_ids` text DEFAULT '[]' NOT NULL;
