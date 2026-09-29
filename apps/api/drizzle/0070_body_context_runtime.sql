CREATE TABLE `body_context_concerns` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`body_region` text,
	`symptom_state` text NOT NULL,
	`management_state` text NOT NULL,
	`source_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`current_revision_id` text NOT NULL,
	`legacy_health_condition_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `body_context_concerns_user_state_idx` ON `body_context_concerns` (`user_id`,`management_state`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `body_context_concern_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`concern_id` text NOT NULL,
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`prior_revision_id` text,
	`change_kind` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`corrected_fields_json` text,
	`reason` text,
	`actor_json` text NOT NULL,
	`decision_authority_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`concern_id`) REFERENCES `body_context_concerns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_context_concern_revisions_record_revision_unique` ON `body_context_concern_revisions` (`concern_id`,`revision`);
--> statement-breakpoint
CREATE INDEX `body_context_concern_revisions_user_record_idx` ON `body_context_concern_revisions` (`user_id`,`concern_id`,`revision`);
--> statement-breakpoint
CREATE TABLE `body_context_capabilities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`state` text NOT NULL,
	`source_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`current_revision_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `body_context_capabilities_user_state_idx` ON `body_context_capabilities` (`user_id`,`state`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `body_context_capability_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`capability_id` text NOT NULL,
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`prior_revision_id` text,
	`change_kind` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`corrected_fields_json` text,
	`reason` text,
	`actor_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`capability_id`) REFERENCES `body_context_capabilities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_context_capability_revisions_record_revision_unique` ON `body_context_capability_revisions` (`capability_id`,`revision`);
--> statement-breakpoint
CREATE INDEX `body_context_capability_revisions_user_record_idx` ON `body_context_capability_revisions` (`user_id`,`capability_id`,`revision`);
--> statement-breakpoint
CREATE TABLE `body_context_guidance` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`concern_id` text,
	`capability_id` text,
	`text` text NOT NULL,
	`source_json` text NOT NULL,
	`state` text DEFAULT 'current' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`current_revision_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concern_id`) REFERENCES `body_context_concerns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`capability_id`) REFERENCES `body_context_capabilities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `body_context_guidance_user_state_idx` ON `body_context_guidance` (`user_id`,`state`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `body_context_guidance_user_concern_idx` ON `body_context_guidance` (`user_id`,`concern_id`);
--> statement-breakpoint
CREATE INDEX `body_context_guidance_user_capability_idx` ON `body_context_guidance` (`user_id`,`capability_id`);
--> statement-breakpoint
CREATE TABLE `body_context_guidance_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`guidance_id` text NOT NULL,
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`prior_revision_id` text,
	`change_kind` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`corrected_fields_json` text,
	`reason` text,
	`actor_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`guidance_id`) REFERENCES `body_context_guidance`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_context_guidance_revisions_record_revision_unique` ON `body_context_guidance_revisions` (`guidance_id`,`revision`);
--> statement-breakpoint
CREATE INDEX `body_context_guidance_revisions_user_record_idx` ON `body_context_guidance_revisions` (`user_id`,`guidance_id`,`revision`);
--> statement-breakpoint
CREATE TABLE `body_context_flares` (
	`id` text PRIMARY KEY NOT NULL,
	`concern_id` text NOT NULL,
	`user_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`local_date` text NOT NULL,
	`time_zone` text NOT NULL,
	`observation` text NOT NULL,
	`source_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`concern_id`) REFERENCES `body_context_concerns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `body_context_flares_user_date_idx` ON `body_context_flares` (`user_id`,`local_date`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `body_context_flares_user_concern_idx` ON `body_context_flares` (`user_id`,`concern_id`);
--> statement-breakpoint
CREATE TABLE `body_context_flare_follow_ups` (
	`id` text PRIMARY KEY NOT NULL,
	`flare_id` text NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`prompt` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`answer` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`flare_id`) REFERENCES `body_context_flares`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_context_flare_follow_ups_flare_key_unique` ON `body_context_flare_follow_ups` (`flare_id`,`key`);
--> statement-breakpoint
CREATE INDEX `body_context_flare_follow_ups_user_state_idx` ON `body_context_flare_follow_ups` (`user_id`,`state`);
--> statement-breakpoint
CREATE TABLE `plan_change_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`state` text DEFAULT 'proposed' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`current_revision_id` text NOT NULL,
	`summary` text NOT NULL,
	`targets_json` text NOT NULL,
	`effects_json` text NOT NULL,
	`source_references_json` text NOT NULL,
	`target_revision_fingerprint` text NOT NULL,
	`proposed_by_json` text NOT NULL,
	`proposed_at` text NOT NULL,
	`approval_json` text,
	`execution_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_change_proposals_user_state_idx` ON `plan_change_proposals` (`user_id`,`state`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `plan_change_proposal_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`prior_revision_id` text,
	`summary` text NOT NULL,
	`targets_json` text NOT NULL,
	`effects_json` text NOT NULL,
	`source_references_json` text NOT NULL,
	`target_revision_fingerprint` text NOT NULL,
	`proposed_by_json` text NOT NULL,
	`proposed_at` text NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `plan_change_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_change_proposal_revisions_record_revision_unique` ON `plan_change_proposal_revisions` (`proposal_id`,`revision`);
--> statement-breakpoint
CREATE INDEX `plan_change_proposal_revisions_user_record_idx` ON `plan_change_proposal_revisions` (`user_id`,`proposal_id`,`revision`);
--> statement-breakpoint
CREATE TABLE `proposal_approval_statements` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`proposal_revision_id` text NOT NULL,
	`target_revision_fingerprint` text NOT NULL,
	`statement` text NOT NULL,
	`source_id` text NOT NULL,
	`source_occurred_at` text NOT NULL,
	`recorded_by_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `plan_change_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `proposal_approval_statements_user_proposal_idx` ON `proposal_approval_statements` (`user_id`,`proposal_id`);
--> statement-breakpoint
CREATE TABLE `body_context_idempotency_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_id` text NOT NULL,
	`route` text NOT NULL,
	`operation` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`status_code` integer NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_context_receipts_scope_key_unique` ON `body_context_idempotency_receipts` (`user_id`,`route`,`operation`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `body_context_receipts_user_created_idx` ON `body_context_idempotency_receipts` (`user_id`,`created_at`);
