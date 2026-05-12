ALTER TABLE `session_sets` ADD `rpe` integer CHECK (`rpe` is null or `rpe` between 1 and 10);--> statement-breakpoint
ALTER TABLE `session_sets` ADD `zone` integer CHECK (`zone` is null or `zone` between 1 and 5);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`muscle_groups` text NOT NULL,
	`equipment` text NOT NULL,
	`category` text NOT NULL,
	`tracking_type` text DEFAULT 'weight_reps' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`form_cues` text DEFAULT '[]' NOT NULL,
	`instructions` text,
	`coaching_notes` text,
	`related_exercise_ids` text DEFAULT '[]' NOT NULL,
	`deleted_at` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "exercises_category_check" CHECK("__new_exercises"."category" in ('compound', 'isolation', 'cardio', 'cardio_flow', 'mobility')),
	CONSTRAINT "exercises_tracking_type_check" CHECK("__new_exercises"."tracking_type" in ('weight_reps', 'weight_seconds', 'bodyweight_reps', 'reps_only', 'reps_seconds', 'seconds_only', 'duration', 'distance', 'cardio'))
);
--> statement-breakpoint
INSERT INTO `__new_exercises`(
	"id",
	"user_id",
	"name",
	"muscle_groups",
	"equipment",
	"category",
	"tracking_type",
	"tags",
	"form_cues",
	"instructions",
	"coaching_notes",
	"related_exercise_ids",
	"deleted_at",
	"created_at",
	"updated_at"
) SELECT
	"id",
	"user_id",
	"name",
	"muscle_groups",
	"equipment",
	"category",
	"tracking_type",
	"tags",
	"form_cues",
	"instructions",
	"coaching_notes",
	"related_exercise_ids",
	"deleted_at",
	"created_at",
	"updated_at"
FROM `exercises`;--> statement-breakpoint
DROP TABLE `exercises`;--> statement-breakpoint
ALTER TABLE `__new_exercises` RENAME TO `exercises`;--> statement-breakpoint
CREATE INDEX `exercises_user_id_idx` ON `exercises` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
