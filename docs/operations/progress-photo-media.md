# Progress photo media operations

Progress-photo media is private application data. SQLite contains scoped metadata only; encrypted
objects live under `/data/private/body-progress/` in the API service's existing `pulse-data` volume.
The web/nginx service has no volume mount and no static route to this directory.

JPEG, PNG, and WebP uploads are decoded, auto-oriented, metadata-stripped, and re-encoded. The
encrypted `original` variant is the full-resolution sanitized image in its detected format, not the
untrusted uploaded byte stream; `full`, `comparison`, and `thumbnail` are sanitized JPEG variants.

## Key provisioning and rotation

Set `BODY_PROGRESS_MEDIA_KEY` at runtime to exactly 32 random bytes encoded as canonical base64.
Generate it with an approved secret-management workstation command such as
`openssl rand -base64 32`, then store it separately from the host, database, media volume, and
backup archives. Never reuse `JWT_SECRET`, an AgentToken, or a password. Missing, malformed, wrong,
or rotated-without-migration keys fail photo media operations closed; ciphertext is not modified.

The on-disk format is `aes-256-gcm-v1`: a version magic, fresh 96-bit nonce, ciphertext, and 128-bit
authentication tag. User id, photo id, variant, generated storage key, and media type are authenticated
as additional data. Rotation requires retaining the old key, decrypting and re-encrypting every object
to a new format/key version in a separately reviewed offline migration, verifying every tag and
checksum, then retiring the old key only after all live and retained backup copies have aged out.
No automatic rotation is claimed by #123.

## Backup and restore

`scripts/backup-db.sh` creates `pulse-YYYYMMDD-HHMMSS.tar.gz` containing a consistent SQLite backup,
the complete encrypted media tree, and a manifest. It fails if media cannot be included. The key is
never in the archive. The newest 30 successful archives are retained; deleting live media therefore
does not instantly erase older encrypted backup copies. Those copies age out through archive rotation.

Restore into an isolated location first. Confirm `manifest.txt` says `format=pulse-backup-v2` and
`media_key_included=false`, run SQLite `PRAGMA quick_check` and `PRAGMA foreign_key_check`, provision
the separately protected matching media key, and verify every referenced encrypted object before the
restored service is allowed to start. An absent or wrong key is a failed restore, not a partial success.
Do not overwrite the live volume until both metadata and media verification succeed.

## Deletion and orphan audit

Live deletion atomically quarantines generated ciphertext names and records durable deletion intents in
the same SQLite transaction that removes scoped metadata. A database failure restores the referenced
files. After that transaction commits, quarantine removal never restores now-unreferenced ciphertext:
each successfully removed object clears its intent, while a removal failure leaves both the quarantine
and intent for retry and returns storage-unavailable rather than false success. API startup finalizes
committed intents and restores only abandoned pre-transaction quarantines that still have live metadata.
Missing files are counted without exposing filesystem paths. Single-photo, set, bulk, and account
deletion all use this protocol.

Run the orphan command report-only by default:

```bash
pnpm --filter @pulse/api exec tsx src/scripts/audit-progress-photo-orphans.ts
```

Metadata-without-file results contain only owned photo ids and counts; file-without-metadata results
are counts only. Repair requires `--repair --user-id <uuid>` and only removes that user's broken
metadata. Unreferenced ciphertext is never deleted by the user-scoped repair because ownership cannot
be proven from a generated filename; global file repair requires a separate reviewed recovery action.
Pending deletion intent and quarantine counts are reported separately and are never silently folded into
ordinary orphan counts.

## Migration rollback and removal boundary

Migrations `0067_body_progress_photo_storage` and `0068_body_progress_photo_deletion_intents` are
additive forward migrations. Dropping their tables or deleting their journal rows is **not** a routine or
supported live rollback: doing so can sever the only ownership and recovery metadata for encrypted
objects. Stop if the database or media tree cannot be backed up together, any integrity/foreign-key check
fails, the matching separately protected media key is unavailable, deletion intents remain unresolved,
or the restored ciphertext cannot be authenticated.

Rollback/removal is permitted only in a disposable rehearsal or an explicitly reviewed outage recovery.
The safe boundary is restoration of one matched snapshot set, never hand-written reverse DDL:

1. Stop all writers and preserve the failed database, WAL/SHM files, encrypted media tree, and key
   version for investigation.
2. Restore the complete predecessor database backup **and its matching predecessor media snapshot** to
   an isolated location. Do not combine a pre-0067 database with post-0067 ciphertext.
3. Run the production migrator and integrity checks against that isolated copy. An idempotent rerun must
   apply zero migrations.
4. For a forward restore, restore the matched migrated database and encrypted media snapshot together,
   provide the matching key separately, and authenticate every referenced object before service start.
5. Replace live state only under a separately approved recovery plan after all checks pass. The #123
   tooling does not claim online reverse migration, automatic key recovery, or safe selective table
   removal.

The synthetic migration rehearsal exercises fresh and populated predecessors, malformed/conflicting
partial schema rollback, idempotent rerun, matched predecessor restoration, and matched forward
database/media/key restoration. It uses disposable databases, synthetic clothed image bytes, and a
synthetic local key only.
