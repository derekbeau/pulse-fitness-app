CREATE TABLE body_progress_photo_preferences (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 consent_version TEXT,
 consent_state TEXT NOT NULL DEFAULT 'not_decided',
 consented_at INTEGER,
 declined_at INTEGER,
 revoked_at INTEGER,
 cadence_days INTEGER NOT NULL DEFAULT 28,
 anchor_date TEXT NOT NULL,
 side_view TEXT NOT NULL DEFAULT 'side_right',
 reminder_local_time TEXT,
 snoozed_until TEXT,
 last_dismissed_due_date TEXT,
 last_scheduled_occurrence_date TEXT,
 created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
 CHECK(consent_state IN ('not_decided','declined','granted','revoked')),
 CHECK((consent_state = 'not_decided' AND consent_version IS NULL) OR (consent_state != 'not_decided' AND consent_version IS NOT NULL AND length(consent_version) > 0)),
 CHECK((consent_state = 'granted' AND consented_at IS NOT NULL AND revoked_at IS NULL) OR (consent_state = 'declined' AND declined_at IS NOT NULL AND consented_at IS NULL AND revoked_at IS NULL) OR (consent_state = 'revoked' AND consented_at IS NOT NULL AND revoked_at IS NOT NULL) OR (consent_state = 'not_decided' AND consented_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL)),
 CHECK(cadence_days BETWEEN 14 AND 180),
 CHECK(anchor_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(anchor_date, '+0 days') = anchor_date),
 CHECK(side_view IN ('side_left','side_right')),
 CHECK(reminder_local_time IS NULL OR (reminder_local_time GLOB '[0-2][0-9]:[0-5][0-9]' AND time(reminder_local_time || ':00') IS NOT NULL)),
 CHECK(snoozed_until IS NULL OR (snoozed_until GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(snoozed_until, '+0 days') = snoozed_until)),
 CHECK(last_dismissed_due_date IS NULL OR (last_dismissed_due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(last_dismissed_due_date, '+0 days') = last_dismissed_due_date)),
 CHECK(last_scheduled_occurrence_date IS NULL OR (last_scheduled_occurrence_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(last_scheduled_occurrence_date, '+0 days') = last_scheduled_occurrence_date))
);
--> statement-breakpoint
CREATE TABLE body_progress_photo_sets (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body_check_in_id TEXT REFERENCES body_check_ins(id) ON DELETE SET NULL,
 local_date TEXT NOT NULL,
 local_time TEXT,
 guide_version TEXT NOT NULL,
 context TEXT NOT NULL CHECK(json_valid(context) AND json_type(context) = 'object'),
 notes TEXT,
 status TEXT NOT NULL DEFAULT 'partial',
 count_as_scheduled_occurrence INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
 UNIQUE(id, user_id),
 CHECK(local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(local_date, '+0 days') = local_date),
 CHECK(local_time IS NULL OR (local_time GLOB '[0-2][0-9]:[0-5][0-9]' AND time(local_time || ':00') IS NOT NULL)),
 CHECK(length(guide_version) > 0),
 CHECK(status IN ('partial','complete')),
 CHECK(count_as_scheduled_occurrence IN (0,1))
);
--> statement-breakpoint
CREATE INDEX body_progress_photo_sets_user_date_idx ON body_progress_photo_sets(user_id, local_date);
--> statement-breakpoint
CREATE INDEX body_progress_photo_sets_check_in_idx ON body_progress_photo_sets(body_check_in_id);
--> statement-breakpoint
CREATE TRIGGER body_progress_photo_sets_check_in_owner_insert
BEFORE INSERT ON body_progress_photo_sets
WHEN NEW.body_check_in_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM body_check_ins WHERE id = NEW.body_check_in_id AND user_id = NEW.user_id
)
BEGIN
 SELECT RAISE(ABORT, 'body progress photo check-in ownership mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER body_progress_photo_sets_check_in_owner_update
BEFORE UPDATE OF body_check_in_id, user_id ON body_progress_photo_sets
WHEN NEW.body_check_in_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM body_check_ins WHERE id = NEW.body_check_in_id AND user_id = NEW.user_id
)
BEGIN
 SELECT RAISE(ABORT, 'body progress photo check-in ownership mismatch');
END;
--> statement-breakpoint
CREATE TABLE body_progress_photos (
 id TEXT PRIMARY KEY NOT NULL,
 set_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 view TEXT NOT NULL,
 normalized_media_type TEXT NOT NULL,
 byte_size INTEGER NOT NULL,
 width INTEGER NOT NULL,
 height INTEGER NOT NULL,
 checksum TEXT NOT NULL,
 variants TEXT NOT NULL CHECK(json_valid(variants) AND json_type(variants) = 'array' AND json_array_length(variants) = 4),
 encryption_version TEXT NOT NULL,
 processing_version TEXT NOT NULL,
 created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
 CONSTRAINT body_progress_photos_owned_set_fk FOREIGN KEY(set_id, user_id) REFERENCES body_progress_photo_sets(id, user_id) ON DELETE CASCADE,
 UNIQUE(set_id, view),
 CHECK(view IN ('front','side_left','side_right','back')),
 CHECK(normalized_media_type = 'image/jpeg'),
 CHECK(byte_size > 0 AND width > 0 AND height > 0),
 CHECK(length(checksum) = 64 AND checksum NOT GLOB '*[^0-9a-f]*'),
 CHECK(encryption_version = 'aes-256-gcm-v1'),
 CHECK(processing_version = 'sharp-jpeg-v1')
);
--> statement-breakpoint
CREATE INDEX body_progress_photos_user_idx ON body_progress_photos(user_id);
