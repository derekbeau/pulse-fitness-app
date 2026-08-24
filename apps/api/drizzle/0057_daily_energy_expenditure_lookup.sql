CREATE INDEX `adaptive_nutrition_checkins_accepted_expenditure_lookup_idx`
	ON `adaptive_nutrition_checkins` (
		`user_id`,
		`program_id`,
		coalesce(json_extract(`proposed_targets`, '$.effectiveDate'), `local_date`),
		`resolved_at`,
		`created_at`,
		`id`
	)
	WHERE `status` = 'accepted'
		AND `proposed_tdee_kcal` IS NOT NULL
		AND `resolved_at` IS NOT NULL;
