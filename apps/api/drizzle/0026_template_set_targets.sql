ALTER TABLE `template_exercises` ADD `set_targets` text;--> statement-breakpoint
ALTER TABLE `template_exercises` ADD `programming_notes` text;--> statement-breakpoint
ALTER TABLE `session_sets` ADD `target_weight` real;--> statement-breakpoint
ALTER TABLE `session_sets` ADD `target_weight_min` real;--> statement-breakpoint
ALTER TABLE `session_sets` ADD `target_weight_max` real;--> statement-breakpoint
ALTER TABLE `session_sets` ADD `target_seconds` integer;--> statement-breakpoint
ALTER TABLE `session_sets` ADD `target_distance` real;
