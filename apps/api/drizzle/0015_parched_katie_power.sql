PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`muscle_groups` text NOT NULL,
	`equipment` text NOT NULL,
	`category` text NOT NULL,
	`tracking_type` text DEFAULT 'weight_reps' NOT NULL,
	`instructions` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "exercises_category_check" CHECK("__new_exercises"."category" in ('compound', 'isolation', 'cardio', 'mobility')),
	CONSTRAINT "exercises_tracking_type_check" CHECK("__new_exercises"."tracking_type" in ('weight_reps', 'weight_seconds', 'bodyweight_reps', 'reps_only', 'reps_seconds', 'seconds_only', 'distance', 'cardio'))
);
--> statement-breakpoint
INSERT INTO `__new_exercises`("id", "user_id", "name", "muscle_groups", "equipment", "category", "tracking_type", "instructions", "created_at", "updated_at") SELECT "id", "user_id", "name", "muscle_groups", "equipment", "category", "tracking_type", "instructions", "created_at", "updated_at" FROM `exercises`;--> statement-breakpoint
DROP TABLE `exercises`;--> statement-breakpoint
ALTER TABLE `__new_exercises` RENAME TO `exercises`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `exercises_user_id_idx` ON `exercises` (`user_id`);
