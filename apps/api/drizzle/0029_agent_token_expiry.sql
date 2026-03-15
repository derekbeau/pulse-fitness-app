ALTER TABLE `agent_tokens` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `agent_tokens` ADD `last_rotated_at` integer;--> statement-breakpoint
UPDATE `agent_tokens`
SET `last_rotated_at` = `created_at`
WHERE `last_rotated_at` IS NULL;
