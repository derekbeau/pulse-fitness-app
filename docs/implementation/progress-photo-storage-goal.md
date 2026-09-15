# Frozen implementation goal: secure encrypted progress-photo storage and media API

**Issue:** #123 — Build secure encrypted progress-photo storage and media API  
**Parent:** #120 — Body Progress check-ins  
**Prerequisite:** #121 is closed and merged into the base below.  
**Consumer:** #125 — private progress-photo capture, timeline, comparison, and privacy UX (separate PR; no UI implementation here).  
**Base:** `origin/main` at `99afa36b33ae01b40aa39fec497775a04b76d19b`  
**Branch:** `feat/progress-photo-storage`  
**Scope:** API/backend, shared contracts, persistence, encrypted filesystem media, backup/restore and verification tooling. No deployment or production data access.

## 1. Outcome and non-goals

Implement a first-class, private progress-photo backend. A user can give versioned opt-in consent, configure an independent photo cadence, create a dated partial or complete set, upload at most three safe normalized views, retrieve only authenticated variants, delete individual views/sets/all live media, and request a re-authenticated sensitive export. SQLite stores metadata only; encrypted media is stored outside the webroot in the API-only persistent data volume.

Do **not** implement #125 capture/timeline/comparison UI, direct camera/getUserMedia, AI/computer vision, face detection, body-fat or tissue estimation, beautification/reshaping, sharing, social/public URLs, video, native push/email/SMS, general exports/journal/dashboard/agent raw media, third-party cloud storage, production deployment, production keys, production database/backfill, or real photos.

## 2. Authoritative product contract

### Consent and privacy

- Photos are opt-in. Persist consent version, consented-at, and revocation time/state; expose structured consent facts and the current contract version.
- Consent is a just-in-time contract for #125: collection, encrypted live storage, JWT-only raw access, retention, deletion, encrypted backup behavior, and no AI analysis. It is separate from general terms.
- Declining leaves measurements, weight, workouts, and other Body Progress features usable. Revocation blocks future uploads but does not delete existing media automatically; deletion is an explicit user choice.
- JWT/Bearer auth is required for all raw bytes and content variants. AgentToken may read user-scoped metadata/due/capabilities only; AgentToken must return 403 for raw content, export, and other sensitive media operations.
- Every query and mutation is scoped by authenticated `userId` and the owned set/photo relation. Opaque UUID IDs are not authorization. Cross-user IDs, guessed IDs, traversal-like values, duplicate views, deleted content, and missing records must not reveal existence or filesystem details.
- Never emit filesystem paths, original filenames, EXIF/GPS, raw bytes, permanent URLs, signed/bearer URLs, or sensitive media identifiers in logs, generic exports, Journal, Dashboard, analytics, agent context, or error messages. Log only safe event/type/count/status fields; never log keys or tokens.

### Cadence and sets

- Default photo cadence is 28 days; presets are 14, 28, and 56 days; custom is 14–180 days. Measurement cadence remains independent.
- Extra sets do not reset the anchor unless `countAsScheduledOccurrence: true`. Skip advances visible occurrence without changing the anchor; snooze delays the current prompt without changing the anchor. Due-state primitives may be reused from #121 but photo state remains separate.
- A set is dated by local `YYYY-MM-DD`, may carry nullable `localTime`, guide version, context flags and notes, and is `partial` or `complete` (front, one configured side, and back). Partial sets are valid and resumable.
- Views are `front`, `side_left`, `side_right`, or `back`; at most one row per `(setId, view)`. Replacing a view is an explicit delete/replace operation, never an implicit duplicate. Preserve capture context and guide version for #125. No medical interpretation.

## 3. Storage and cryptographic contract

Tables are metadata only:

- `body_progress_photo_sets`: UUID `id`, owning `userId` FK cascade, nullable `bodyCheckInId` FK set-null, local date/time, guide version, structured context/notes, `status`, created/updated timestamps.
- `body_progress_photos`: UUID `id`, `setId` FK cascade, redundant `userId` scope key, `view`, generated storage key, normalized media type, byte size, width/height, checksum, encryption format/version, nonce/IV and authentication-tag metadata, processing version, timestamps; unique `(setId, view)`.
- A consent/preferences table is preferred over untyped `users.preferences`: one row/user with consent version/state/timestamps, cadence, anchor, optional snooze/dismissed due state, and strict typed JSON where needed. Follow existing date/time authority; do not let browser timezone override persisted/program authority.
- User deletion cascades metadata and triggers verified private-file cleanup. Deleting a check-in sets `bodyCheckInId` null and does not silently delete its photo set.

Store no plaintext image bytes in SQLite. Use `/data/private/body-progress/` (or an equivalent configured private root) inside the API-only persistent `/data` volume, outside nginx/webroot, with non-executable permissions and generated UUID storage names. The API is the only service with access.

Use a dedicated runtime secret `BODY_PROGRESS_MEDIA_KEY`, separate from `JWT_SECRET` and AgentToken secrets. Do not reuse JWT signing or password material. Do not hardcode, commit, print, persist in SQLite, or read production keys. Validate key format/length at startup or first media operation; absent/invalid key fails closed for photo routes without modifying ciphertext. Document secret provisioning, rotation/versioning, backup separation, and restore key requirements. The format must be versioned for future rotation/migration.

Use Node’s standard-library `crypto` authenticated encryption, e.g. AES-256-GCM with a fresh cryptographically random nonce per object, authenticated metadata as additional authenticated data, and tag verification before releasing plaintext. Do not implement custom cryptography. Streaming encryption/decryption must bound memory and surface integrity failure as a generic non-leaking error. Plaintext may exist only in bounded, permissioned temporary processing files; cleanup in success, failure, interruption, and transaction rollback paths. Never claim key backup is implemented unless the documented operational contract and local rehearsal prove it.

## 4. Upload/normalization security

Add a maintained multipart dependency and maintained image decoder/rewriter only after checking Docker/libvips compatibility and HEIC behavior in the production-shaped image. Required inputs: JPEG, PNG, WebP. HEIC/HEIF must be explicitly supported and normalized or clearly rejected with a tested client-conversion/rejection contract; do not defer this decision. Reject SVG, GIF, PDF, ZIP, executables/polyglots, unknown formats, and malformed content.

- Authenticate before accepting bytes. Enforce request, file, set-count, and aggregate multipart limits. Default max is 12 MiB/input and max three images/set request; centralize constants and expose them in capabilities.
- Client MIME and extension are hints. Validate extension, declared MIME, magic bytes, decoder output, dimensions, decompressed memory and normalized output. Reject mismatch, double extensions, path traversal names, decompression bombs, oversized pixels, malformed EXIF/orientation and animated content.
- Auto-orient safely before stripping metadata; decode and re-encode to a normalized non-animated safe format. Strip all EXIF/IPTC/XMP/location metadata. Generate thumbnail and comparison-size derivative with bounded dimensions; retain only product-required encrypted variants and provenance/version metadata. Never silently alter body proportions.
- Use a non-executable private temp directory, generated UUID keys, atomic rename only after complete validation/normalization/encryption, and cleanup on every error/transaction failure. Ensure no symlink/path traversal escape from the configured root.
- Responses use only authenticated application routes, correct normalized `Content-Type`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, restrictive CSP where applicable, and `Cache-Control: private, no-store` unless a separately documented encrypted private-cache strategy is actually implemented. Nginx must not serve the private path directly.
- Nginx `client_max_body_size` must align with the API request limit; oversized requests return an explicit safe error.

## 5. API and shared contracts

Create strict Zod request/response/error/capability schemas and OpenAPI definitions. Use standard `{ data }` and paginated envelopes; no client prose parsing. Preserve one unified schema surface, with route-level `requireJwtOnly` for bytes/export/sensitive operations.

Metadata/set routes:

- `GET /api/v1/body-progress/photos/preferences`
- `PATCH /api/v1/body-progress/photos/preferences`
- `GET /api/v1/body-progress/photo-sets/?from=&to=&page=&limit=`
- `POST /api/v1/body-progress/photo-sets/`
- `GET /api/v1/body-progress/photo-sets/:id`
- `PATCH /api/v1/body-progress/photo-sets/:id`
- `DELETE /api/v1/body-progress/photo-sets/:id`

Media/lifecycle routes:

- `POST /api/v1/body-progress/photo-sets/:id/photos` multipart
- `DELETE /api/v1/body-progress/photos/:id`
- `GET /api/v1/body-progress/photos/:id/content?variant=thumbnail|comparison|full` (JWT only)
- Provide explicit user-scoped bulk delete and a re-authenticated transient sensitive export contract covering metadata, originals, normalized variants and documented backup-retention semantics. Do not add generic export exposure.
- Provide structured capabilities with formats, HEIC behavior, limits, variants, consent/version, cadence/due state, set completeness, processing state, deletion/export status, backup-retention facts, and precise error codes.

Errors must be stable and non-sensitive: authentication/authorization, consent required/revoked, validation/signature/decoder/pixel/size, duplicate view, processing, storage unavailable, key unavailable, integrity failure, export re-auth required, and not-found. Avoid revealing whether another user’s ID exists or whether a path/file is present.

## 6. Backup, restore, deletion, purge and orphan lifecycle

Update backup/restore tooling and documentation so SQLite metadata and `/data/private/body-progress/` ciphertext are included consistently, or explicitly fail the backup when media cannot be included. A backup must never contain the media key. Restore verification requires the separately protected key and fails clearly/closed when absent or invalid. Test a local synthetic backup/restore round-trip with synthetic key material only; do not access production volumes or secrets.

Deletion must remove metadata and all encrypted originals/normalized/thumbnail/comparison derivatives. Missing files and repeated deletion are idempotent and observable without leaking paths. Include an explicit purge path for account/user-scoped live media and document that encrypted backup retention ages out according to the stated policy rather than pretending deletion instantly erases every backup copy. Export is transient, re-authenticated, bounded, cleaned up, and never logged or placed in a generic export.

Add a report-only-by-default orphan audit/repair command. Report metadata-without-file and file-without-metadata counts using safe opaque IDs/counts; repair requires an explicit flag, remains user-scoped where applicable, and is covered by tests. No automatic destructive repair or production invocation.

## 7. Migration and implementation inventory

Before coding, inspect and reuse:

- `apps/api/src/db/schema/index.ts`, existing user/body-check-in schemas and Drizzle migration/test conventions;
- `apps/api/src/routes/body-check-ins/`, `apps/api/src/routes/v1/context.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/lib/session-jwt.ts`, reply/error conventions and AgentToken enrichment;
- `apps/api/src/index.ts` route registration/OpenAPI; `packages/shared/src/index.ts` and body-progress schemas;
- `Dockerfile`, `docker-compose.yml`, nginx configuration and `scripts/backup-db.sh`;
- `docs/conventions/api-conventions.md`, `docs/conventions/data-models.md`, `docs/specs/user-time-zone-v1.md`, and #120/#121/#125 contracts;
- current package lock/dependency versions and Docker build constraints.

Likely files: shared photo schemas; new Drizzle tables and strictly ordered migration; private storage abstraction; streaming AEAD crypto adapter; safe image validation/normalization; body-progress-photo route/store/plugin/tests; route registration/OpenAPI; Docker/Compose/nginx limits and private volume permissions; backup/restore extension; report-only orphan audit; focused fixtures/tests and documentation.

Migration must be additive, foreign-key enabled, fail-closed, and tested against fresh schema, populated legacy schema at `99afa36`, already-canonical schema, partial/malformed schema, rollback/removal documentation, and user-deletion cascade/file-cleanup behavior. Never edit a recorded migration in place. Do not backfill existing history or touch production.

## 8. Required tests and evidence

Use synthetic clothed image fixtures only; synthetic test keys live in local test fixtures and are never real secrets. No custom crypto. Tests must prove:

1. shared schemas/capabilities/error codes and OpenAPI;
2. consent opt-in/decline/revocation and independent 28-day cadence, skip/snooze/extra-set semantics;
3. strict metadata migration and legacy/populated/malformed preflight;
4. JWT-only bytes/export versus AgentToken metadata-only access;
5. cross-user isolation, guessed IDs, path traversal, duplicate-view race and cache/deleted-content denial;
6. size/file/count/pixel/decompression limits, extension/MIME/signature/decoder mismatch, SVG/GIF/PDF/ZIP/polyglot rejection, malformed EXIF and orientation;
7. JPEG/PNG/WebP normalization, EXIF/GPS stripping, HEIC support or exact rejection flow;
8. streaming encryption nonce uniqueness, authenticated metadata, ciphertext-at-rest, successful decrypt, wrong/missing/rotated key fail-closed, tamper/integrity failure with no plaintext/error leakage;
9. atomic upload and cleanup under interrupted processing, DB failure, rename failure and repeated retry;
10. thumbnail/comparison/full variant ownership, content headers, no public/static route and no nginx direct serving;
11. partial upload resume and no duplicate successful views;
12. single/set/bulk delete, user purge, check-in set-null linkage, idempotence and file cleanup;
13. re-authenticated transient export scope/cleanup and explicit encrypted-backup retention semantics;
14. backup/restore synthetic round-trip and missing-key failure; report-only orphan audit and explicit repair;
15. nginx/API limit agreement and existing auth/JSON/body-check-in regressions.

Run focused tests while editing, then one final uncached risk-relevant gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, plus focused photo/security/migration suites. Record raw command output, exact HEAD SHA, dependency/lockfile identity, fixture/key provenance and clean `git diff --check`. Do not reuse stale receipts. No browser/UI or installed-Chrome implementation is required for #123; #125 will verify its own UX against these contracts.

## 9. Implementer contract and stop conditions

The sole implementer must verify actual cwd, branch, base SHA and working-tree state before edits; preserve all unrelated pre-existing work; read this goal and source inventory first; use a bounded plan; and perform an internal focused security/migration review before the final gate. Commit one coherent Conventional Commit and push the feature branch/draft PR only as authorized by the launch assignment; do not merge.

Never deploy, start an app server for production, access/change `.env` or production keys, use real photos, mutate live DBs/volumes, backfill history, configure a new cloud/external provider, or weaken a requirement silently. If a security/privacy-critical choice cannot be derived from #120/#121/#123/#125, standard library behavior, or the inspected repository, stop with the precise gap instead of inventing a provider or waiver. No medical analysis.

Return: actual cwd/branch/base and final SHA; changed files; dependency and lockfile changes; migration/storage threat model; test fixtures and key provenance; exact uncached commands/results; backup/restore and orphan evidence; API contract summary for #125; screenshots only if any native/runtime proof is performed; explicit confirmation of prohibited actions not taken; and blockers. Stop at draft PR/independent review—no deployment.

## 10. Exact issue mapping

- **#120:** parent rationale, cross-cutting user/time-zone/privacy invariants and family-level non-goals.
- **#121 (closed):** prerequisite check-in schema/auth/date/cadence conventions; photo cadence is separate and uses its proven ownership/auth patterns.
- **#122 (merged in base):** server-owned Body Progress trends; no photo analytics or client-side interpretation here.
- **#123 (this goal):** all secure storage/media API, consent persistence, encryption, validation, private retrieval, lifecycle, backup/restore, export/purge, orphan audit and backend tests.
- **#124:** measurement setup/check-in/history web UX; not modified here.
- **#125:** future photo consent/capture/timeline/comparison/privacy UX; consume this API; not modified here.

**Frozen decision gaps that must be resolved by the implementer before implementation, not silently waived:** production-shaped HEIC behavior after Docker/image-library inspection; exact encrypted-backup retention/provider operations if current tooling cannot support a truthful contract; exact export archive format and re-auth mechanism if existing auth has no safe transient pattern. If these cannot be derived locally, stop and report the gap; do not add a new cloud provider or invent security behavior.
