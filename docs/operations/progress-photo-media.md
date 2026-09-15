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

Live deletion atomically quarantines generated ciphertext names, commits scoped metadata deletion,
then removes the quarantine. A database failure restores the files. Missing files are counted without
exposing filesystem paths. Account deletion uses the same staging contract before the user cascade.

Run the orphan command report-only by default:

```bash
pnpm --filter @pulse/api exec tsx src/scripts/audit-progress-photo-orphans.ts
```

Metadata-without-file results contain only owned photo ids and counts; file-without-metadata results
are counts only. Repair requires `--repair --user-id <uuid>` and only removes that user's broken
metadata. Unreferenced ciphertext is never deleted by the user-scoped repair because ownership cannot
be proven from a generated filename; global file repair requires a separate reviewed recovery action.
