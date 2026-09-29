CREATE TABLE `journal_observations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `local_date` text NOT NULL,
  `time_zone` text NOT NULL,
  `current_revision_id` text NOT NULL,
  `revision` integer NOT NULL,
  `snapshot_json` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `journal_observations_revision_check` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE INDEX `journal_observations_user_day_idx` ON `journal_observations` (`user_id`,`local_date`,`created_at`);
--> statement-breakpoint
CREATE TABLE `journal_observation_revisions` (
  `id` text PRIMARY KEY NOT NULL,
  `observation_id` text NOT NULL REFERENCES `journal_observations`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `revision` integer NOT NULL,
  `prior_revision_id` text REFERENCES `journal_observation_revisions`(`id`) ON DELETE CASCADE,
  `recorded_at` text NOT NULL,
  `recorded_by_json` text NOT NULL,
  `reason` text,
  `snapshot_json` text NOT NULL,
  UNIQUE(`observation_id`,`revision`),
  CONSTRAINT `journal_observation_revisions_sequence_check` CHECK(`revision` >= 1 AND ((`revision` = 1 AND `prior_revision_id` IS NULL) OR (`revision` > 1 AND `prior_revision_id` IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE `journal_idempotency_receipts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `route` text NOT NULL,
  `operation` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_fingerprint` text NOT NULL,
  `status_code` integer NOT NULL,
  `response_json` text NOT NULL,
  `created_at` text NOT NULL,
  UNIQUE(`user_id`,`route`,`operation`,`idempotency_key`)
);
