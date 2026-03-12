ALTER TABLE habits ADD COLUMN reference_source text;
--> statement-breakpoint
ALTER TABLE habits ADD COLUMN reference_config text;
--> statement-breakpoint
ALTER TABLE habit_entries ADD COLUMN is_override integer DEFAULT false NOT NULL;
