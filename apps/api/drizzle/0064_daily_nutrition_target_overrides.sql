CREATE TABLE daily_nutrition_target_overrides (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 date TEXT NOT NULL,
 calories REAL,
 protein REAL,
 carbs REAL,
 fat REAL,
 reason TEXT,
 reason_code_units INTEGER,
 created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
 UNIQUE(user_id,date),
 CHECK(date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 CHECK(calories IS NOT NULL OR protein IS NOT NULL OR carbs IS NOT NULL OR fat IS NOT NULL),
 CHECK((calories IS NULL OR (calories >= 0 AND calories <= 10000)) AND (protein IS NULL OR (protein >= 0 AND protein <= 1000)) AND (carbs IS NULL OR (carbs >= 0 AND carbs <= 1000)) AND (fat IS NULL OR (fat >= 0 AND fat <= 1000))),
 CHECK((reason IS NULL AND reason_code_units IS NULL) OR (reason IS NOT NULL AND reason = trim(reason) AND reason_code_units BETWEEN 1 AND 2000))
);
--> statement-breakpoint
CREATE INDEX daily_nutrition_target_overrides_owner_date_idx ON daily_nutrition_target_overrides(user_id,date);
