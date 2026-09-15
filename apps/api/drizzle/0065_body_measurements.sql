CREATE TABLE body_measurements (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 local_date TEXT NOT NULL,
 waist_mm INTEGER,
 hips_mm INTEGER,
 chest_mm INTEGER,
 neck_mm INTEGER,
 left_arm_mm INTEGER,
 right_arm_mm INTEGER,
 left_thigh_mm INTEGER,
 right_thigh_mm INTEGER,
 body_fat_percent REAL,
 unit_at_entry TEXT,
 notes TEXT,
 created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
 UNIQUE(user_id,local_date),
 CHECK(local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(local_date, '+0 days') = local_date),
 CHECK((waist_mm IS NULL OR (typeof(waist_mm) = 'integer' AND waist_mm BETWEEN 200 AND 3000))
   AND (hips_mm IS NULL OR (typeof(hips_mm) = 'integer' AND hips_mm BETWEEN 200 AND 3000))
   AND (chest_mm IS NULL OR (typeof(chest_mm) = 'integer' AND chest_mm BETWEEN 200 AND 3000))
   AND (neck_mm IS NULL OR (typeof(neck_mm) = 'integer' AND neck_mm BETWEEN 200 AND 3000))
   AND (left_arm_mm IS NULL OR (typeof(left_arm_mm) = 'integer' AND left_arm_mm BETWEEN 200 AND 3000))
   AND (right_arm_mm IS NULL OR (typeof(right_arm_mm) = 'integer' AND right_arm_mm BETWEEN 200 AND 3000))
   AND (left_thigh_mm IS NULL OR (typeof(left_thigh_mm) = 'integer' AND left_thigh_mm BETWEEN 200 AND 3000))
   AND (right_thigh_mm IS NULL OR (typeof(right_thigh_mm) = 'integer' AND right_thigh_mm BETWEEN 200 AND 3000))
   AND (body_fat_percent IS NULL OR (body_fat_percent BETWEEN 1 AND 70
     AND abs(body_fat_percent * 10 - round(body_fat_percent * 10)) < 0.000000001))),
 CHECK(waist_mm IS NOT NULL OR hips_mm IS NOT NULL OR chest_mm IS NOT NULL OR neck_mm IS NOT NULL
   OR left_arm_mm IS NOT NULL OR right_arm_mm IS NOT NULL OR left_thigh_mm IS NOT NULL
   OR right_thigh_mm IS NOT NULL OR body_fat_percent IS NOT NULL),
 CHECK(unit_at_entry IS NULL OR unit_at_entry IN ('cm', 'in')),
 CHECK((waist_mm IS NULL AND hips_mm IS NULL AND chest_mm IS NULL AND neck_mm IS NULL
   AND left_arm_mm IS NULL AND right_arm_mm IS NULL AND left_thigh_mm IS NULL AND right_thigh_mm IS NULL)
   OR unit_at_entry IS NOT NULL),
 CHECK(notes IS NULL OR (notes = trim(notes) AND length(notes) BETWEEN 1 AND 2000))
);
--> statement-breakpoint
CREATE INDEX body_measurements_user_id_local_date_idx ON body_measurements(user_id,local_date);
