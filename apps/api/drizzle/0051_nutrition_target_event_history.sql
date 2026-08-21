CREATE UNIQUE INDEX `nutrition_targets_id_user_id_unique`
ON `nutrition_targets` (`id`, `user_id`);
--> statement-breakpoint
CREATE TABLE `nutrition_target_events` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`user_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`effective_date` text NOT NULL,
	`calories` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`macro_calories` real NOT NULL,
	`source` text NOT NULL,
	`adaptive_check_in_id` text,
	`event_type` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`,`user_id`) REFERENCES `nutrition_targets`(`id`,`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`adaptive_check_in_id`,`user_id`) REFERENCES `adaptive_nutrition_checkins`(`id`,`user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `nutrition_target_events_sequence_check` CHECK (`sequence` >= 1),
	CONSTRAINT `nutrition_target_events_effective_date_check` CHECK (`effective_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT `nutrition_target_events_values_check` CHECK (`calories` >= 0 and `protein` >= 0 and `carbs` >= 0 and `fat` >= 0 and `macro_calories` >= 0 and abs(`macro_calories` - ((`protein` * 4) + (`carbs` * 4) + (`fat` * 9))) < 0.000001),
	CONSTRAINT `nutrition_target_events_source_check` CHECK (`source` in ('manual', 'adaptive')),
	CONSTRAINT `nutrition_target_events_provenance_check` CHECK ((`source` = 'manual' and `adaptive_check_in_id` is null and `event_type` in ('manual_write', 'migration_backfill')) or (`source` = 'adaptive' and `adaptive_check_in_id` is not null and `event_type` in ('adaptive_accept', 'migration_backfill'))),
	CONSTRAINT `nutrition_target_events_event_type_check` CHECK (`event_type` in ('manual_write', 'adaptive_accept', 'migration_backfill')),
	CONSTRAINT `nutrition_target_events_timestamps_check` CHECK (`recorded_at` > 0 and `created_at` > 0)
);
--> statement-breakpoint
CREATE INDEX `nutrition_target_events_user_effective_recorded_idx`
ON `nutrition_target_events` (`user_id`, `effective_date`, `recorded_at`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_target_events_target_sequence_unique`
ON `nutrition_target_events` (`target_id`, `sequence`);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_target_events_adaptive_check_in_unique`
ON `nutrition_target_events` (`adaptive_check_in_id`)
WHERE `adaptive_check_in_id` is not null;
--> statement-breakpoint
CREATE TEMP TABLE `__nutrition_target_accepted_backfill` AS
SELECT
	c.`id` AS `check_in_id`,
	c.`user_id`,
	c.`accepted_nutrition_target_id` AS `target_id`,
	c.`resolved_at` AS `recorded_at`,
	coalesce(
		(
			SELECT json_extract(a.`payload`, '$.appliedProposal')
			FROM `adaptive_nutrition_reviews` r
			JOIN `adaptive_nutrition_review_actions` a
				ON a.`review_id` = r.`id` AND a.`user_id` = r.`user_id`
			WHERE r.`check_in_id` = c.`id`
				AND r.`user_id` = c.`user_id`
				AND a.`type` = 'accept'
			ORDER BY a.`sequence` DESC, a.`id` DESC
			LIMIT 1
		),
		c.`proposed_targets`
	) AS `proposal`
FROM `adaptive_nutrition_checkins` c
WHERE c.`status` = 'accepted';
--> statement-breakpoint
CREATE TEMP TABLE `__nutrition_target_backfill_validation` (
	`valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_accepted_backfill` a
	LEFT JOIN `nutrition_targets` t
		ON t.`id` = a.`target_id` AND t.`user_id` = a.`user_id`
	WHERE a.`target_id` is null
		OR a.`recorded_at` is null
		OR a.`recorded_at` <= 0
		OR t.`id` is null
		OR json_valid(a.`proposal`) = 0
		OR json_type(a.`proposal`) <> 'object'
		OR json_type(a.`proposal`, '$.calories') not in ('integer', 'real')
		OR json_type(a.`proposal`, '$.protein') not in ('integer', 'real')
		OR json_type(a.`proposal`, '$.carbs') not in ('integer', 'real')
		OR json_type(a.`proposal`, '$.fat') not in ('integer', 'real')
		OR json_type(a.`proposal`, '$.effectiveDate') <> 'text'
		OR json_extract(a.`proposal`, '$.calories') < 0
		OR json_extract(a.`proposal`, '$.protein') < 0
		OR json_extract(a.`proposal`, '$.carbs') < 0
		OR json_extract(a.`proposal`, '$.fat') < 0
		OR json_extract(a.`proposal`, '$.effectiveDate') not glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `nutrition_targets` t
	LEFT JOIN `__nutrition_target_accepted_backfill` a
		ON a.`check_in_id` = t.`adaptive_check_in_id` AND a.`user_id` = t.`user_id`
	WHERE t.`source` = 'adaptive'
		AND (
			a.`check_in_id` is null
			OR a.`target_id` <> t.`id`
			OR json_extract(a.`proposal`, '$.effectiveDate') <> t.`effective_date`
			OR abs(json_extract(a.`proposal`, '$.calories') - t.`calories`) >= 0.000001
			OR abs(json_extract(a.`proposal`, '$.protein') - t.`protein`) >= 0.000001
			OR abs(json_extract(a.`proposal`, '$.carbs') - t.`carbs`) >= 0.000001
			OR abs(json_extract(a.`proposal`, '$.fat') - t.`fat`) >= 0.000001
		)
) THEN 0 ELSE 1 END;
--> statement-breakpoint
CREATE TEMP TABLE `__nutrition_target_event_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`user_id` text NOT NULL,
	`effective_date` text NOT NULL,
	`calories` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`macro_calories` real NOT NULL,
	`source` text NOT NULL,
	`adaptive_check_in_id` text,
	`recorded_at` integer NOT NULL,
	`sort_priority` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__nutrition_target_event_candidates`
SELECT
	'migration-predecessor:' || c.`id`,
	json_extract(c.`current_targets`, '$.id'),
	c.`user_id`,
	json_extract(c.`current_targets`, '$.effectiveDate'),
	json_extract(c.`current_targets`, '$.calories'),
	json_extract(c.`current_targets`, '$.protein'),
	json_extract(c.`current_targets`, '$.carbs'),
	json_extract(c.`current_targets`, '$.fat'),
	(json_extract(c.`current_targets`, '$.protein') * 4) +
		(json_extract(c.`current_targets`, '$.carbs') * 4) +
		(json_extract(c.`current_targets`, '$.fat') * 9),
	'manual',
	null,
	json_extract(c.`current_targets`, '$.updatedAt'),
	0
FROM `adaptive_nutrition_checkins` c
JOIN `nutrition_targets` t
	ON t.`id` = json_extract(c.`current_targets`, '$.id')
	AND t.`user_id` = c.`user_id`
WHERE c.`status` = 'accepted'
	AND json_valid(c.`current_targets`)
	AND json_type(c.`current_targets`) = 'object'
	AND json_type(c.`current_targets`, '$.id') = 'text'
	AND json_type(c.`current_targets`, '$.calories') in ('integer', 'real')
	AND json_type(c.`current_targets`, '$.protein') in ('integer', 'real')
	AND json_type(c.`current_targets`, '$.carbs') in ('integer', 'real')
	AND json_type(c.`current_targets`, '$.fat') in ('integer', 'real')
	AND json_type(c.`current_targets`, '$.macroCalories') in ('integer', 'real')
	AND json_type(c.`current_targets`, '$.source') = 'text'
	AND json_type(c.`current_targets`, '$.adaptiveCheckInId') = 'null'
	AND json_type(c.`current_targets`, '$.effectiveDate') = 'text'
	AND json_type(c.`current_targets`, '$.createdAt') = 'integer'
	AND json_type(c.`current_targets`, '$.updatedAt') = 'integer'
	AND json_extract(c.`current_targets`, '$.source') = 'manual'
	AND json_extract(c.`current_targets`, '$.createdAt') = t.`created_at`
	AND json_extract(c.`current_targets`, '$.updatedAt') between t.`created_at` and t.`updated_at`
	AND json_extract(c.`current_targets`, '$.calories') >= 0
	AND json_extract(c.`current_targets`, '$.protein') >= 0
	AND json_extract(c.`current_targets`, '$.carbs') >= 0
	AND json_extract(c.`current_targets`, '$.fat') >= 0
	AND abs(
		json_extract(c.`current_targets`, '$.macroCalories') -
		((json_extract(c.`current_targets`, '$.protein') * 4) +
		 (json_extract(c.`current_targets`, '$.carbs') * 4) +
		 (json_extract(c.`current_targets`, '$.fat') * 9))
	) < 0.000001
	AND json_extract(c.`current_targets`, '$.effectiveDate') glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
--> statement-breakpoint
INSERT INTO `__nutrition_target_event_candidates`
SELECT
	'migration-accepted:' || a.`check_in_id`,
	a.`target_id`,
	a.`user_id`,
	json_extract(a.`proposal`, '$.effectiveDate'),
	json_extract(a.`proposal`, '$.calories'),
	json_extract(a.`proposal`, '$.protein'),
	json_extract(a.`proposal`, '$.carbs'),
	json_extract(a.`proposal`, '$.fat'),
	(json_extract(a.`proposal`, '$.protein') * 4) +
		(json_extract(a.`proposal`, '$.carbs') * 4) +
		(json_extract(a.`proposal`, '$.fat') * 9),
	'adaptive',
	a.`check_in_id`,
	a.`recorded_at`,
	CASE WHEN a.`check_in_id` = t.`adaptive_check_in_id` THEN 2 ELSE 1 END
FROM `__nutrition_target_accepted_backfill` a
JOIN `nutrition_targets` t
	ON t.`id` = a.`target_id` AND t.`user_id` = a.`user_id`;
--> statement-breakpoint
INSERT INTO `__nutrition_target_event_candidates`
SELECT
	'migration-current:' || t.`id`,
	t.`id`,
	t.`user_id`,
	t.`effective_date`,
	t.`calories`,
	t.`protein`,
	t.`carbs`,
	t.`fat`,
	(t.`protein` * 4) + (t.`carbs` * 4) + (t.`fat` * 9),
	'manual',
	null,
	t.`updated_at`,
	2
FROM `nutrition_targets` t
WHERE t.`source` = 'manual';
--> statement-breakpoint
DELETE FROM `__nutrition_target_event_candidates`
WHERE `source` = 'manual'
	AND `id` NOT IN (
		SELECT min(c.`id`)
		FROM `__nutrition_target_event_candidates` c
		WHERE c.`source` = 'manual'
		GROUP BY c.`target_id`, c.`user_id`, c.`effective_date`, c.`calories`, c.`protein`,
			c.`carbs`, c.`fat`, c.`macro_calories`, c.`recorded_at`
	);
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `nutrition_targets` t
	WHERE NOT EXISTS (
			SELECT 1 FROM `__nutrition_target_event_candidates` c
			WHERE c.`target_id` = t.`id` AND c.`user_id` = t.`user_id`
		)
		OR coalesce((
			SELECT min(c.`recorded_at`) FROM `__nutrition_target_event_candidates` c
			WHERE c.`target_id` = t.`id` AND c.`user_id` = t.`user_id`
		), -1) <> t.`created_at`
		OR coalesce((
			SELECT max(c.`recorded_at`) FROM `__nutrition_target_event_candidates` c
			WHERE c.`target_id` = t.`id` AND c.`user_id` = t.`user_id`
		), -1) <> t.`updated_at`
		OR EXISTS (
			SELECT 1 FROM `__nutrition_target_event_candidates` c
			WHERE c.`target_id` = t.`id`
				AND c.`user_id` = t.`user_id`
				AND (c.`recorded_at` < t.`created_at` OR c.`recorded_at` > t.`updated_at`)
		)
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
WITH `latest_candidates` AS (
	SELECT
		c.*,
		row_number() OVER (
			PARTITION BY c.`target_id`
			ORDER BY c.`recorded_at` DESC, c.`sort_priority` DESC, c.`id` DESC
		) AS `rank`
	FROM `__nutrition_target_event_candidates` c
)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `nutrition_targets` t
	LEFT JOIN `latest_candidates` c
		ON c.`target_id` = t.`id` AND c.`user_id` = t.`user_id` AND c.`rank` = 1
	WHERE c.`id` is null
		OR c.`effective_date` <> t.`effective_date`
		OR abs(c.`calories` - t.`calories`) >= 0.000001
		OR abs(c.`protein` - t.`protein`) >= 0.000001
		OR abs(c.`carbs` - t.`carbs`) >= 0.000001
		OR abs(c.`fat` - t.`fat`) >= 0.000001
		OR abs(c.`macro_calories` - ((t.`protein` * 4) + (t.`carbs` * 4) + (t.`fat` * 9))) >= 0.000001
		OR c.`source` <> t.`source`
		OR c.`adaptive_check_in_id` is not t.`adaptive_check_in_id`
		OR c.`recorded_at` <> t.`updated_at`
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `nutrition_target_events` (
	`id`, `target_id`, `user_id`, `sequence`, `effective_date`, `calories`, `protein`,
	`carbs`, `fat`, `macro_calories`, `source`, `adaptive_check_in_id`, `event_type`,
	`recorded_at`, `created_at`
)
SELECT
	c.`id`,
	c.`target_id`,
	c.`user_id`,
	row_number() OVER (
		PARTITION BY c.`target_id`
		ORDER BY c.`recorded_at`, c.`sort_priority`, c.`id`
	),
	c.`effective_date`,
	c.`calories`,
	c.`protein`,
	c.`carbs`,
	c.`fat`,
	c.`macro_calories`,
	c.`source`,
	c.`adaptive_check_in_id`,
	'migration_backfill',
	c.`recorded_at`,
	c.`recorded_at`
FROM `__nutrition_target_event_candidates` c
ORDER BY c.`target_id`, c.`recorded_at`, c.`sort_priority`, c.`id`;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
WITH `latest_events` AS (
	SELECT
		e.*,
		row_number() OVER (PARTITION BY e.`target_id` ORDER BY e.`sequence` DESC) AS `rank`
	FROM `nutrition_target_events` e
)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `nutrition_targets` t
	LEFT JOIN `latest_events` e
		ON e.`target_id` = t.`id` AND e.`user_id` = t.`user_id` AND e.`rank` = 1
	WHERE e.`id` is null
		OR e.`effective_date` <> t.`effective_date`
		OR abs(e.`calories` - t.`calories`) >= 0.000001
		OR abs(e.`protein` - t.`protein`) >= 0.000001
		OR abs(e.`carbs` - t.`carbs`) >= 0.000001
		OR abs(e.`fat` - t.`fat`) >= 0.000001
		OR abs(e.`macro_calories` - ((t.`protein` * 4) + (t.`carbs` * 4) + (t.`fat` * 9))) >= 0.000001
		OR e.`source` <> t.`source`
		OR e.`adaptive_check_in_id` is not t.`adaptive_check_in_id`
		OR e.`recorded_at` <> t.`updated_at`
) THEN 0 ELSE 1 END;
--> statement-breakpoint
DROP TABLE `__nutrition_target_event_candidates`;
--> statement-breakpoint
DROP TABLE `__nutrition_target_backfill_validation`;
--> statement-breakpoint
DROP TABLE `__nutrition_target_accepted_backfill`;
--> statement-breakpoint
CREATE TRIGGER `nutrition_target_events_insert_guard`
BEFORE INSERT ON `nutrition_target_events`
WHEN NEW.`sequence` <> coalesce(
	(SELECT max(e.`sequence`) + 1 FROM `nutrition_target_events` e WHERE e.`target_id` = NEW.`target_id`),
	1
)
	OR NEW.`recorded_at` < coalesce(
	(SELECT max(e.`recorded_at`) FROM `nutrition_target_events` e WHERE e.`target_id` = NEW.`target_id`),
	NEW.`recorded_at`
)
BEGIN
	SELECT RAISE(ABORT, 'nutrition target event must use the exact next sequence and nondecreasing recorded time');
END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_target_events_update_guard`
BEFORE UPDATE ON `nutrition_target_events`
BEGIN
	SELECT RAISE(ABORT, 'nutrition target events are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_target_events_delete_guard`
BEFORE DELETE ON `nutrition_target_events`
WHEN NOT EXISTS (
	SELECT 1 FROM `adaptive_nutrition_account_deletion_scope` s WHERE s.`user_id` = OLD.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'nutrition target events may only be deleted inside account deletion scope');
END;
