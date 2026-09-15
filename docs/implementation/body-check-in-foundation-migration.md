# Body check-in foundation migration lifecycle

Migration `0066_body_check_in_foundation.sql` is additive. It creates typed preference, check-in, and repeated-reading tables without changing or interpreting any row in the legacy scalar `body_measurements` table. Existing scalar CRUD remains the compatibility surface for those historical facts.

Production application and backfill are intentionally outside #169. Before a future deployment, take the standard SQLite backup and run the migration against a disposable restored copy. Removal is a forward migration, never a production rewrite of `0066`: drop `body_check_in_measurement_versions`, `body_check_in_versions`, `body_check_in_measurements`, `body_check_ins`, then `body_check_in_preferences`. That removal deletes only the new domain; it does not touch scalar `body_measurements`. If data preservation is required, export the five new tables before the forward removal migration.

SQLite does not provide a safe automatic down migration here. Operational rollback is restoration of the pre-migration backup plus the previous application image. Do not copy a partially migrated database over production.
