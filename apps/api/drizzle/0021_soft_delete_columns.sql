ALTER TABLE habits ADD COLUMN deleted_at text;
--> statement-breakpoint
ALTER TABLE workout_templates ADD COLUMN deleted_at text;
--> statement-breakpoint
ALTER TABLE exercises ADD COLUMN deleted_at text;
--> statement-breakpoint
ALTER TABLE foods ADD COLUMN deleted_at text;
--> statement-breakpoint
ALTER TABLE workout_sessions ADD COLUMN deleted_at text;
