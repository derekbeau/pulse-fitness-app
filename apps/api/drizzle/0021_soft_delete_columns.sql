ALTER TABLE habits ADD COLUMN deleted_at text;
--> statement-breakpoint
ALTER TABLE workout_templates ADD COLUMN deleted_at text;
--> statement-breakpoint
ALTER TABLE exercises ADD COLUMN deleted_at text;
--> statement-breakpoint
ALTER TABLE foods ADD COLUMN deleted_at text;
--> statement-breakpoint
ALTER TABLE workout_sessions ADD COLUMN deleted_at text;
--> statement-breakpoint
CREATE INDEX idx_habits_user_id_deleted_at ON habits(user_id, deleted_at);
--> statement-breakpoint
CREATE INDEX idx_workout_templates_user_id_deleted_at ON workout_templates(user_id, deleted_at);
--> statement-breakpoint
CREATE INDEX idx_exercises_user_id_deleted_at ON exercises(user_id, deleted_at);
--> statement-breakpoint
CREATE INDEX idx_foods_user_id_deleted_at ON foods(user_id, deleted_at);
--> statement-breakpoint
CREATE INDEX idx_workout_sessions_user_id_deleted_at ON workout_sessions(user_id, deleted_at);
