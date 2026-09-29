CREATE TABLE body_check_in_measurements_new (
 id TEXT PRIMARY KEY NOT NULL,
 check_in_id TEXT NOT NULL REFERENCES body_check_ins(id) ON DELETE CASCADE,
 site TEXT NOT NULL,
 laterality TEXT NOT NULL,
 unit_at_entry TEXT NOT NULL,
 reading_1_mm INTEGER NOT NULL,
 reading_2_mm INTEGER,
 reading_3_mm INTEGER,
 canonical_mm INTEGER NOT NULL,
 quality TEXT NOT NULL,
 selected_reading_pair TEXT,
 protocol_id TEXT NOT NULL,
 protocol_version TEXT NOT NULL,
 protocol_name TEXT NOT NULL,
 protocol_instructions TEXT NOT NULL,
 protocol_source_urls TEXT NOT NULL,
 created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
 UNIQUE(check_in_id, site, laterality),
 CHECK(unit_at_entry IN ('cm', 'in')),
 CHECK(reading_3_mm IS NULL OR reading_2_mm IS NOT NULL),
 CHECK(quality IN ('single_reading','replicated','needs_third_reading','replicated_with_tiebreaker','high_variance')),
 CHECK((site IN ('waist_iliac_crest_nhanes','chest_nipple_line_relaxed','hips_maximum','neck_below_larynx_relaxed','shoulder_girth_deltoid') AND laterality = 'none') OR (site IN ('upper_arm_midpoint_flexed','thigh_midpoint','calf_maximum_relaxed','forearm_maximum_relaxed') AND laterality IN ('left','right'))),
 CHECK(
   (site IN ('waist_iliac_crest_nhanes','chest_nipple_line_relaxed','hips_maximum','upper_arm_midpoint_flexed','thigh_midpoint') AND reading_1_mm BETWEEN 200 AND 3000 AND (reading_2_mm IS NULL OR reading_2_mm BETWEEN 200 AND 3000) AND (reading_3_mm IS NULL OR reading_3_mm BETWEEN 200 AND 3000) AND canonical_mm BETWEEN 200 AND 3000) OR
   (site = 'calf_maximum_relaxed' AND reading_1_mm BETWEEN 150 AND 800 AND (reading_2_mm IS NULL OR reading_2_mm BETWEEN 150 AND 800) AND (reading_3_mm IS NULL OR reading_3_mm BETWEEN 150 AND 800) AND canonical_mm BETWEEN 150 AND 800) OR
   (site = 'forearm_maximum_relaxed' AND reading_1_mm BETWEEN 100 AND 600 AND (reading_2_mm IS NULL OR reading_2_mm BETWEEN 100 AND 600) AND (reading_3_mm IS NULL OR reading_3_mm BETWEEN 100 AND 600) AND canonical_mm BETWEEN 100 AND 600) OR
   (site = 'neck_below_larynx_relaxed' AND reading_1_mm BETWEEN 200 AND 800 AND (reading_2_mm IS NULL OR reading_2_mm BETWEEN 200 AND 800) AND (reading_3_mm IS NULL OR reading_3_mm BETWEEN 200 AND 800) AND canonical_mm BETWEEN 200 AND 800) OR
   (site = 'shoulder_girth_deltoid' AND reading_1_mm BETWEEN 500 AND 2000 AND (reading_2_mm IS NULL OR reading_2_mm BETWEEN 500 AND 2000) AND (reading_3_mm IS NULL OR reading_3_mm BETWEEN 500 AND 2000) AND canonical_mm BETWEEN 500 AND 2000)
 )
);
--> statement-breakpoint
INSERT INTO body_check_in_measurements_new SELECT * FROM body_check_in_measurements;
--> statement-breakpoint
DROP TABLE body_check_in_measurements;
--> statement-breakpoint
ALTER TABLE body_check_in_measurements_new RENAME TO body_check_in_measurements;
--> statement-breakpoint
CREATE INDEX body_check_in_measurements_check_in_idx ON body_check_in_measurements(check_in_id);
--> statement-breakpoint
CREATE TABLE body_check_in_measurement_versions_new (
 id TEXT PRIMARY KEY NOT NULL,
 version_id TEXT NOT NULL REFERENCES body_check_in_versions(id) ON DELETE CASCADE,
 site TEXT NOT NULL,
 laterality TEXT NOT NULL,
 unit_at_entry TEXT NOT NULL,
 reading_1_mm INTEGER NOT NULL,
 reading_2_mm INTEGER,
 reading_3_mm INTEGER,
 canonical_mm INTEGER NOT NULL,
 quality TEXT NOT NULL,
 selected_reading_pair TEXT,
 protocol_id TEXT NOT NULL,
 protocol_version TEXT NOT NULL,
 protocol_name TEXT NOT NULL,
 protocol_instructions TEXT NOT NULL,
 protocol_source_urls TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(version_id, site, laterality),
 CHECK(unit_at_entry IN ('cm', 'in')),
 CHECK(reading_3_mm IS NULL OR reading_2_mm IS NOT NULL),
 CHECK(quality IN ('single_reading','replicated','needs_third_reading','replicated_with_tiebreaker','high_variance')),
 CHECK((site IN ('waist_iliac_crest_nhanes','chest_nipple_line_relaxed','hips_maximum','neck_below_larynx_relaxed','shoulder_girth_deltoid') AND laterality = 'none') OR (site IN ('upper_arm_midpoint_flexed','thigh_midpoint','calf_maximum_relaxed','forearm_maximum_relaxed') AND laterality IN ('left','right'))),
 CHECK(
   (site IN ('waist_iliac_crest_nhanes','chest_nipple_line_relaxed','hips_maximum','upper_arm_midpoint_flexed','thigh_midpoint') AND reading_1_mm BETWEEN 200 AND 3000 AND (reading_2_mm IS NULL OR reading_2_mm BETWEEN 200 AND 3000) AND (reading_3_mm IS NULL OR reading_3_mm BETWEEN 200 AND 3000) AND canonical_mm BETWEEN 200 AND 3000) OR
   (site = 'calf_maximum_relaxed' AND reading_1_mm BETWEEN 150 AND 800 AND (reading_2_mm IS NULL OR reading_2_mm BETWEEN 150 AND 800) AND (reading_3_mm IS NULL OR reading_3_mm BETWEEN 150 AND 800) AND canonical_mm BETWEEN 150 AND 800) OR
   (site = 'forearm_maximum_relaxed' AND reading_1_mm BETWEEN 100 AND 600 AND (reading_2_mm IS NULL OR reading_2_mm BETWEEN 100 AND 600) AND (reading_3_mm IS NULL OR reading_3_mm BETWEEN 100 AND 600) AND canonical_mm BETWEEN 100 AND 600) OR
   (site = 'neck_below_larynx_relaxed' AND reading_1_mm BETWEEN 200 AND 800 AND (reading_2_mm IS NULL OR reading_2_mm BETWEEN 200 AND 800) AND (reading_3_mm IS NULL OR reading_3_mm BETWEEN 200 AND 800) AND canonical_mm BETWEEN 200 AND 800) OR
   (site = 'shoulder_girth_deltoid' AND reading_1_mm BETWEEN 500 AND 2000 AND (reading_2_mm IS NULL OR reading_2_mm BETWEEN 500 AND 2000) AND (reading_3_mm IS NULL OR reading_3_mm BETWEEN 500 AND 2000) AND canonical_mm BETWEEN 500 AND 2000)
 )
);
--> statement-breakpoint
INSERT INTO body_check_in_measurement_versions_new SELECT * FROM body_check_in_measurement_versions;
--> statement-breakpoint
DROP TABLE body_check_in_measurement_versions;
--> statement-breakpoint
ALTER TABLE body_check_in_measurement_versions_new RENAME TO body_check_in_measurement_versions;
--> statement-breakpoint
CREATE INDEX body_check_in_measurement_versions_version_idx ON body_check_in_measurement_versions(version_id);
