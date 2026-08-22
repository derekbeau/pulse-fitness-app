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
CREATE TEMP TABLE `__nutrition_target_backfill_validation` (
	`valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint
CREATE TEMP TABLE `__nutrition_target_check_in_lifecycle_claims` AS
SELECT
	c.`id` AS `check_in_id`,
	c.`user_id`,
	c.`program_id`,
	c.`goal_id`,
	c.`goal_revision_id`,
	c.`status`,
	c.`resolved_at`,
	c.`created_at`
FROM `adaptive_nutrition_checkins` c
WHERE c.`status` = 'accepted'
UNION
SELECT
	c.`id`,
	c.`user_id`,
	c.`program_id`,
	c.`goal_id`,
	c.`goal_revision_id`,
	c.`status`,
	c.`resolved_at`,
	c.`created_at`
FROM `adaptive_nutrition_review_actions` a
JOIN `adaptive_nutrition_reviews` r ON r.`id` = a.`review_id`
JOIN `adaptive_nutrition_checkins` c ON c.`id` = r.`check_in_id`
WHERE a.`type` = 'accept';
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_check_in_lifecycle_claims` c
	LEFT JOIN `adaptive_nutrition_programs` p ON p.`id` = c.`program_id`
	LEFT JOIN `adaptive_nutrition_goals` g ON g.`id` = c.`goal_id`
	LEFT JOIN `adaptive_nutrition_goal_revisions` revision
		ON revision.`id` = c.`goal_revision_id`
	WHERE p.`id` is null
		OR p.`user_id` <> c.`user_id`
		OR p.`created_at` <= 0
		OR c.`created_at` <= 0
		OR c.`created_at` < p.`created_at`
		OR (c.`goal_id` is null) <> (c.`goal_revision_id` is null)
		OR (c.`goal_id` is not null AND (
			g.`id` is null
			OR g.`user_id` <> c.`user_id`
			OR g.`program_id` <> c.`program_id`
			OR g.`created_at` <= 0
			OR g.`created_at` < p.`created_at`
			OR c.`created_at` < g.`created_at`
			OR revision.`id` is null
			OR revision.`user_id` <> c.`user_id`
			OR revision.`goal_id` <> c.`goal_id`
			OR revision.`created_at` <= 0
			OR revision.`created_at` < g.`created_at`
			OR revision.`created_at` > c.`created_at`
		))
		OR (c.`status` = 'accepted' AND (
			c.`resolved_at` is null
			OR c.`resolved_at` <= 0
			OR c.`resolved_at` < c.`created_at`
		))
) THEN 0 ELSE 1 END;
--> statement-breakpoint
CREATE TEMP TABLE `__nutrition_target_predecessor_claims` AS
SELECT
	c.`id` AS `check_in_id`,
	c.`user_id`,
	c.`program_id`,
	c.`goal_id`,
	c.`created_at` AS `claim_created_at`,
	c.`current_targets` AS `snapshot`
FROM `adaptive_nutrition_checkins` c
WHERE c.`status` = 'accepted'
	AND c.`current_targets` is not null;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_predecessor_claims` p
	WHERE CASE
		WHEN json_valid(p.`snapshot`) THEN json_type(p.`snapshot`) <> 'object'
		ELSE 1
	END
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_predecessor_claims` p
	WHERE coalesce(json_type(p.`snapshot`, '$.id'), 'missing') <> 'text'
		OR coalesce(json_type(p.`snapshot`, '$.calories'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(p.`snapshot`, '$.protein'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(p.`snapshot`, '$.carbs'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(p.`snapshot`, '$.fat'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(p.`snapshot`, '$.macroCalories'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(p.`snapshot`, '$.source'), 'missing') <> 'text'
		OR coalesce(json_type(p.`snapshot`, '$.adaptiveCheckInId'), 'missing') not in ('null', 'text')
		OR coalesce(json_type(p.`snapshot`, '$.effectiveDate'), 'missing') <> 'text'
		OR coalesce(json_type(p.`snapshot`, '$.createdAt'), 'missing') <> 'integer'
		OR coalesce(json_type(p.`snapshot`, '$.updatedAt'), 'missing') <> 'integer'
		OR EXISTS (
			SELECT 1
			FROM json_each(p.`snapshot`) field
			WHERE field.`key` not in (
				'id', 'calories', 'protein', 'carbs', 'fat', 'macroCalories', 'source',
				'adaptiveCheckInId', 'effectiveDate', 'createdAt', 'updatedAt'
			)
		)
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_predecessor_claims` p
	LEFT JOIN `nutrition_targets` t
		ON t.`id` = json_extract(p.`snapshot`, '$.id') AND t.`user_id` = p.`user_id`
	LEFT JOIN `adaptive_nutrition_programs` claim_program
		ON claim_program.`id` = p.`program_id` AND claim_program.`user_id` = p.`user_id`
	LEFT JOIN `adaptive_nutrition_goals` claim_goal
		ON claim_goal.`id` = p.`goal_id` AND claim_goal.`user_id` = p.`user_id`
	LEFT JOIN `adaptive_nutrition_checkins` source_check_in
		ON source_check_in.`id` = json_extract(p.`snapshot`, '$.adaptiveCheckInId')
		AND source_check_in.`user_id` = p.`user_id`
	WHERE t.`id` is null
		OR p.`claim_created_at` <= 0
		OR claim_program.`id` is null
		OR p.`claim_created_at` < claim_program.`created_at`
		OR (p.`goal_id` is not null AND (
			claim_goal.`id` is null
			OR claim_goal.`program_id` <> p.`program_id`
			OR p.`claim_created_at` < claim_goal.`created_at`
		))
		OR json_extract(p.`snapshot`, '$.calories') < 0
		OR json_extract(p.`snapshot`, '$.protein') < 0
		OR json_extract(p.`snapshot`, '$.carbs') < 0
		OR json_extract(p.`snapshot`, '$.fat') < 0
		OR json_extract(p.`snapshot`, '$.macroCalories') < 0
		OR abs(
			json_extract(p.`snapshot`, '$.macroCalories') -
			((json_extract(p.`snapshot`, '$.protein') * 4) +
			 (json_extract(p.`snapshot`, '$.carbs') * 4) +
			 (json_extract(p.`snapshot`, '$.fat') * 9))
		) >= 0.000001
		OR json_extract(p.`snapshot`, '$.effectiveDate') not glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
		OR json_extract(p.`snapshot`, '$.effectiveDate') <> t.`effective_date`
		OR json_extract(p.`snapshot`, '$.createdAt') <> t.`created_at`
		OR json_extract(p.`snapshot`, '$.createdAt') > json_extract(p.`snapshot`, '$.updatedAt')
		OR json_extract(p.`snapshot`, '$.updatedAt') not between t.`created_at` and t.`updated_at`
		OR json_extract(p.`snapshot`, '$.updatedAt') > p.`claim_created_at`
		OR json_extract(p.`snapshot`, '$.source') not in ('manual', 'adaptive')
		OR (
			json_extract(p.`snapshot`, '$.source') = 'manual'
			AND json_type(p.`snapshot`, '$.adaptiveCheckInId') <> 'null'
		)
		OR (
			json_extract(p.`snapshot`, '$.source') = 'adaptive'
			AND (
				json_type(p.`snapshot`, '$.adaptiveCheckInId') <> 'text'
				OR source_check_in.`id` is null
				OR source_check_in.`status` <> 'accepted'
				OR source_check_in.`accepted_nutrition_target_id` <> t.`id`
				OR source_check_in.`resolved_at` <> json_extract(p.`snapshot`, '$.updatedAt')
				OR source_check_in.`created_at` <= 0
				OR source_check_in.`resolved_at` < source_check_in.`created_at`
				OR source_check_in.`resolved_at` > p.`claim_created_at`
			)
		)
) THEN 0 ELSE 1 END;
--> statement-breakpoint
CREATE TEMP TABLE `__nutrition_target_accept_action_claims` AS
SELECT
	a.`id` AS `action_id`,
	a.`review_id` AS `action_review_id`,
	a.`user_id` AS `action_user_id`,
	r.`id` AS `review_id`,
	r.`check_in_id` AS `review_check_in_id`,
	r.`user_id` AS `review_user_id`,
	r.`program_id` AS `review_program_id`,
	c.`id` AS `check_in_id`,
	c.`user_id` AS `user_id`,
	c.`user_id` AS `check_in_user_id`,
	c.`program_id` AS `check_in_program_id`,
	c.`status` AS `check_in_status`,
	c.`accepted_nutrition_target_id`,
	c.`created_at` AS `check_in_created_at`,
	c.`resolved_at` AS `check_in_resolved_at`,
	r.`created_at` AS `review_created_at`,
	t.`id` AS `target_id`,
	t.`user_id` AS `target_user_id`,
	t.`effective_date` AS `target_effective_date`,
	a.`sequence`,
	a.`payload`,
	a.`created_at`
FROM `adaptive_nutrition_review_actions` a
LEFT JOIN `adaptive_nutrition_reviews` r ON r.`id` = a.`review_id`
LEFT JOIN `adaptive_nutrition_checkins` c ON c.`id` = r.`check_in_id`
LEFT JOIN `nutrition_targets` t ON t.`id` = c.`accepted_nutrition_target_id`
WHERE a.`type` = 'accept';
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_accept_action_claims` a
	WHERE a.`review_id` is null
		OR a.`review_id` <> a.`action_review_id`
		OR a.`review_user_id` is not a.`action_user_id`
		OR a.`check_in_id` is null
		OR a.`check_in_id` <> a.`review_check_in_id`
		OR a.`check_in_user_id` is not a.`review_user_id`
		OR a.`check_in_program_id` is not a.`review_program_id`
		OR a.`check_in_created_at` <= 0
		OR a.`review_created_at` <= 0
		OR a.`created_at` <= 0
		OR a.`check_in_resolved_at` is null
		OR a.`check_in_resolved_at` <= 0
		OR a.`review_created_at` < a.`check_in_created_at`
		OR a.`created_at` < a.`review_created_at`
		OR a.`created_at` < a.`check_in_created_at`
		OR a.`created_at` <> a.`check_in_resolved_at`
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_accept_action_claims` a
	WHERE CASE
		WHEN json_valid(a.`payload`) THEN json_type(a.`payload`) <> 'object'
		ELSE 1
	END
		OR coalesce(json_type(a.`payload`, '$.appliedProposal'), 'missing') not in ('null', 'object')
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_accept_action_claims` a
	WHERE (
		json_type(a.`payload`, '$.appliedProposal') = 'object'
		AND (
			a.`check_in_status` <> 'accepted'
			OR a.`accepted_nutrition_target_id` is null
			OR a.`target_id` is null
			OR a.`target_user_id` is not a.`check_in_user_id`
		)
	) OR (
		json_type(a.`payload`, '$.appliedProposal') = 'null'
		AND (
			a.`check_in_status` <> 'declined'
			OR a.`accepted_nutrition_target_id` is not null
		)
	)
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_accept_action_claims` a
	WHERE json_type(a.`payload`, '$.appliedProposal') = 'object'
		AND (coalesce(json_type(a.`payload`, '$.appliedProposal.calories'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(a.`payload`, '$.appliedProposal.protein'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(a.`payload`, '$.appliedProposal.carbs'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(a.`payload`, '$.appliedProposal.fat'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(a.`payload`, '$.appliedProposal.effectiveDate'), 'missing') <> 'text'
		OR json_extract(a.`payload`, '$.appliedProposal.calories') < 0
		OR json_extract(a.`payload`, '$.appliedProposal.protein') < 0
		OR json_extract(a.`payload`, '$.appliedProposal.carbs') < 0
		OR json_extract(a.`payload`, '$.appliedProposal.fat') < 0
		OR abs(
			json_extract(a.`payload`, '$.appliedProposal.calories') -
			((json_extract(a.`payload`, '$.appliedProposal.protein') * 4) +
			 (json_extract(a.`payload`, '$.appliedProposal.carbs') * 4) +
			 (json_extract(a.`payload`, '$.appliedProposal.fat') * 9))
		) > 2.000001
			OR json_extract(a.`payload`, '$.appliedProposal.effectiveDate') not glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
			OR json_extract(a.`payload`, '$.appliedProposal.effectiveDate') <> a.`target_effective_date`
			OR EXISTS (
				SELECT 1
				FROM json_each(json_extract(a.`payload`, '$.appliedProposal')) field
				WHERE field.`key` not in ('calories', 'protein', 'carbs', 'fat', 'effectiveDate')
			)
		)
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_accept_action_claims` a
	JOIN `__nutrition_target_accept_action_claims` b
		ON b.`check_in_id` = a.`check_in_id`
		AND b.`check_in_user_id` = a.`check_in_user_id`
		AND b.`action_id` > a.`action_id`
	WHERE json_type(a.`payload`, '$.appliedProposal') = 'object'
		AND json_type(b.`payload`, '$.appliedProposal') = 'object'
		AND (abs(json_extract(a.`payload`, '$.appliedProposal.calories') - json_extract(b.`payload`, '$.appliedProposal.calories')) >= 0.000001
		OR abs(json_extract(a.`payload`, '$.appliedProposal.protein') - json_extract(b.`payload`, '$.appliedProposal.protein')) >= 0.000001
		OR abs(json_extract(a.`payload`, '$.appliedProposal.carbs') - json_extract(b.`payload`, '$.appliedProposal.carbs')) >= 0.000001
		OR abs(json_extract(a.`payload`, '$.appliedProposal.fat') - json_extract(b.`payload`, '$.appliedProposal.fat')) >= 0.000001
		OR json_extract(a.`payload`, '$.appliedProposal.effectiveDate') <> json_extract(b.`payload`, '$.appliedProposal.effectiveDate'))
) THEN 0 ELSE 1 END;
--> statement-breakpoint
CREATE TEMP TABLE `__nutrition_target_accepted_backfill` AS
SELECT
	c.`id` AS `check_in_id`,
	c.`user_id`,
	c.`accepted_nutrition_target_id` AS `target_id`,
	c.`program_id`,
	c.`goal_id`,
	c.`created_at` AS `claim_created_at`,
	c.`resolved_at` AS `recorded_at`,
	c.`proposed_targets` AS `base_proposal`,
	(
		SELECT json_extract(a.`payload`, '$.appliedProposal')
		FROM `__nutrition_target_accept_action_claims` a
		WHERE a.`check_in_id` = c.`id` AND a.`user_id` = c.`user_id`
			AND json_type(a.`payload`, '$.appliedProposal') = 'object'
		ORDER BY a.`created_at` DESC, a.`sequence` DESC, a.`action_id` DESC
		LIMIT 1
	) AS `action_proposal`
FROM `adaptive_nutrition_checkins` c
WHERE c.`status` = 'accepted';
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_accepted_backfill` a
	LEFT JOIN `nutrition_targets` t
		ON t.`id` = a.`target_id` AND t.`user_id` = a.`user_id`
	LEFT JOIN `adaptive_nutrition_programs` claim_program
		ON claim_program.`id` = a.`program_id` AND claim_program.`user_id` = a.`user_id`
	LEFT JOIN `adaptive_nutrition_goals` claim_goal
		ON claim_goal.`id` = a.`goal_id` AND claim_goal.`user_id` = a.`user_id`
	WHERE a.`target_id` is null
		OR a.`claim_created_at` <= 0
		OR claim_program.`id` is null
		OR a.`claim_created_at` < claim_program.`created_at`
		OR (a.`goal_id` is not null AND (
			claim_goal.`id` is null
			OR claim_goal.`program_id` <> a.`program_id`
			OR a.`claim_created_at` < claim_goal.`created_at`
		))
		OR a.`recorded_at` is null
		OR a.`recorded_at` <= 0
		OR a.`recorded_at` < a.`claim_created_at`
		OR t.`id` is null
		OR a.`recorded_at` not between t.`created_at` and t.`updated_at`
		OR CASE
			WHEN json_valid(a.`base_proposal`) THEN json_type(a.`base_proposal`) <> 'object'
			ELSE 1
		END
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_accepted_backfill` a
	WHERE coalesce(json_type(a.`base_proposal`, '$.calories'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(a.`base_proposal`, '$.protein'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(a.`base_proposal`, '$.carbs'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(a.`base_proposal`, '$.fat'), 'missing') not in ('integer', 'real')
		OR coalesce(json_type(a.`base_proposal`, '$.effectiveDate'), 'missing') <> 'text'
		OR json_extract(a.`base_proposal`, '$.calories') < 0
		OR json_extract(a.`base_proposal`, '$.protein') < 0
		OR json_extract(a.`base_proposal`, '$.carbs') < 0
		OR json_extract(a.`base_proposal`, '$.fat') < 0
		OR abs(
			json_extract(a.`base_proposal`, '$.calories') -
			((json_extract(a.`base_proposal`, '$.protein') * 4) +
			 (json_extract(a.`base_proposal`, '$.carbs') * 4) +
			 (json_extract(a.`base_proposal`, '$.fat') * 9))
		) > 2.000001
			OR json_extract(a.`base_proposal`, '$.effectiveDate') not glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
			OR EXISTS (
				SELECT 1
				FROM json_each(a.`base_proposal`) field
				WHERE field.`key` not in ('calories', 'protein', 'carbs', 'fat', 'effectiveDate')
			)
	) THEN 0 ELSE 1 END;
--> statement-breakpoint
UPDATE `__nutrition_target_accepted_backfill`
SET `base_proposal` = coalesce(`action_proposal`, `base_proposal`);
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_accepted_backfill` a
	JOIN `nutrition_targets` t
		ON t.`id` = a.`target_id` AND t.`user_id` = a.`user_id`
	WHERE json_extract(a.`base_proposal`, '$.effectiveDate') <> t.`effective_date`
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
			OR json_extract(a.`base_proposal`, '$.effectiveDate') <> t.`effective_date`
			OR abs(json_extract(a.`base_proposal`, '$.calories') - t.`calories`) >= 0.000001
				OR abs(json_extract(a.`base_proposal`, '$.protein') - t.`protein`) >= 0.000001
				OR abs(json_extract(a.`base_proposal`, '$.carbs') - t.`carbs`) >= 0.000001
				OR abs(json_extract(a.`base_proposal`, '$.fat') - t.`fat`) >= 0.000001
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
	'migration-predecessor:' || p.`check_in_id`,
	json_extract(p.`snapshot`, '$.id'),
	p.`user_id`,
	json_extract(p.`snapshot`, '$.effectiveDate'),
	json_extract(p.`snapshot`, '$.calories'),
	json_extract(p.`snapshot`, '$.protein'),
	json_extract(p.`snapshot`, '$.carbs'),
	json_extract(p.`snapshot`, '$.fat'),
	json_extract(p.`snapshot`, '$.macroCalories'),
	json_extract(p.`snapshot`, '$.source'),
	json_extract(p.`snapshot`, '$.adaptiveCheckInId'),
	json_extract(p.`snapshot`, '$.updatedAt'),
	0
FROM `__nutrition_target_predecessor_claims` p;
--> statement-breakpoint
INSERT INTO `__nutrition_target_event_candidates`
SELECT
	'migration-accepted:' || a.`check_in_id`,
	a.`target_id`,
	a.`user_id`,
	json_extract(a.`base_proposal`, '$.effectiveDate'),
	json_extract(a.`base_proposal`, '$.calories'),
	json_extract(a.`base_proposal`, '$.protein'),
	json_extract(a.`base_proposal`, '$.carbs'),
	json_extract(a.`base_proposal`, '$.fat'),
	(json_extract(a.`base_proposal`, '$.protein') * 4) +
		(json_extract(a.`base_proposal`, '$.carbs') * 4) +
		(json_extract(a.`base_proposal`, '$.fat') * 9),
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
WHERE `id` NOT IN (
		SELECT min(c.`id`)
		FROM `__nutrition_target_event_candidates` c
		GROUP BY c.`target_id`, c.`user_id`, c.`effective_date`, c.`calories`, c.`protein`,
			c.`carbs`, c.`fat`, c.`macro_calories`, c.`source`, c.`adaptive_check_in_id`,
			c.`recorded_at`
		);
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_accept_action_claims` a
	WHERE json_type(a.`payload`, '$.appliedProposal') = 'object'
		AND NOT EXISTS (
			SELECT 1
			FROM `__nutrition_target_event_candidates` c
			WHERE c.`target_id` = a.`accepted_nutrition_target_id`
				AND c.`user_id` = a.`check_in_user_id`
				AND c.`effective_date` = json_extract(a.`payload`, '$.appliedProposal.effectiveDate')
				AND abs(c.`calories` - json_extract(a.`payload`, '$.appliedProposal.calories')) < 0.000001
				AND abs(c.`protein` - json_extract(a.`payload`, '$.appliedProposal.protein')) < 0.000001
				AND abs(c.`carbs` - json_extract(a.`payload`, '$.appliedProposal.carbs')) < 0.000001
				AND abs(c.`fat` - json_extract(a.`payload`, '$.appliedProposal.fat')) < 0.000001
				AND c.`source` = 'adaptive'
				AND c.`adaptive_check_in_id` = a.`check_in_id`
				AND c.`recorded_at` = a.`created_at`
		)
		OR (
			json_type(a.`payload`, '$.appliedProposal') = 'null'
			AND EXISTS (
				SELECT 1
				FROM `__nutrition_target_event_candidates` c
				WHERE c.`adaptive_check_in_id` = a.`check_in_id`
			)
		)
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_predecessor_claims` p
	WHERE NOT EXISTS (
		SELECT 1
		FROM `__nutrition_target_event_candidates` c
		WHERE c.`target_id` = json_extract(p.`snapshot`, '$.id')
			AND c.`user_id` = p.`user_id`
			AND c.`effective_date` = json_extract(p.`snapshot`, '$.effectiveDate')
			AND abs(c.`calories` - json_extract(p.`snapshot`, '$.calories')) < 0.000001
			AND abs(c.`protein` - json_extract(p.`snapshot`, '$.protein')) < 0.000001
			AND abs(c.`carbs` - json_extract(p.`snapshot`, '$.carbs')) < 0.000001
			AND abs(c.`fat` - json_extract(p.`snapshot`, '$.fat')) < 0.000001
			AND abs(c.`macro_calories` - json_extract(p.`snapshot`, '$.macroCalories')) < 0.000001
			AND c.`source` = json_extract(p.`snapshot`, '$.source')
			AND c.`adaptive_check_in_id` is json_extract(p.`snapshot`, '$.adaptiveCheckInId')
			AND c.`recorded_at` = json_extract(p.`snapshot`, '$.updatedAt')
	)
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `__nutrition_target_accepted_backfill` a
	WHERE NOT EXISTS (
		SELECT 1
		FROM `__nutrition_target_event_candidates` c
		WHERE c.`target_id` = a.`target_id`
			AND c.`user_id` = a.`user_id`
			AND c.`effective_date` = json_extract(a.`base_proposal`, '$.effectiveDate')
			AND abs(c.`calories` - json_extract(a.`base_proposal`, '$.calories')) < 0.000001
			AND abs(c.`protein` - json_extract(a.`base_proposal`, '$.protein')) < 0.000001
			AND abs(c.`carbs` - json_extract(a.`base_proposal`, '$.carbs')) < 0.000001
			AND abs(c.`fat` - json_extract(a.`base_proposal`, '$.fat')) < 0.000001
			AND c.`source` = 'adaptive'
			AND c.`adaptive_check_in_id` = a.`check_in_id`
			AND c.`recorded_at` = a.`recorded_at`
	)
) THEN 0 ELSE 1 END;
--> statement-breakpoint
INSERT INTO `__nutrition_target_backfill_validation` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `nutrition_targets` t
	WHERE NOT EXISTS (
		SELECT 1
		FROM `__nutrition_target_event_candidates` c
		WHERE c.`target_id` = t.`id`
			AND c.`user_id` = t.`user_id`
			AND c.`effective_date` = t.`effective_date`
			AND abs(c.`calories` - t.`calories`) < 0.000001
			AND abs(c.`protein` - t.`protein`) < 0.000001
			AND abs(c.`carbs` - t.`carbs`) < 0.000001
			AND abs(c.`fat` - t.`fat`) < 0.000001
			AND c.`source` = t.`source`
			AND c.`adaptive_check_in_id` is t.`adaptive_check_in_id`
			AND c.`recorded_at` = t.`updated_at`
	)
) THEN 0 ELSE 1 END;
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
SELECT CASE WHEN
	(SELECT count(*) FROM `__nutrition_target_event_candidates`) <>
	(SELECT count(*) FROM `nutrition_target_events`)
	OR EXISTS (
		SELECT 1
		FROM `__nutrition_target_event_candidates` c
		WHERE NOT EXISTS (
			SELECT 1
			FROM `nutrition_target_events` e
			WHERE e.`id` = c.`id`
				AND e.`target_id` = c.`target_id`
				AND e.`user_id` = c.`user_id`
				AND e.`effective_date` = c.`effective_date`
				AND abs(e.`calories` - c.`calories`) < 0.000001
				AND abs(e.`protein` - c.`protein`) < 0.000001
				AND abs(e.`carbs` - c.`carbs`) < 0.000001
				AND abs(e.`fat` - c.`fat`) < 0.000001
				AND abs(e.`macro_calories` - c.`macro_calories`) < 0.000001
				AND e.`source` = c.`source`
				AND e.`adaptive_check_in_id` is c.`adaptive_check_in_id`
				AND e.`recorded_at` = c.`recorded_at`
		)
	)
THEN 0 ELSE 1 END;
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
DROP TABLE `__nutrition_target_accept_action_claims`;
--> statement-breakpoint
DROP TABLE `__nutrition_target_predecessor_claims`;
--> statement-breakpoint
DROP TABLE `__nutrition_target_check_in_lifecycle_claims`;
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
