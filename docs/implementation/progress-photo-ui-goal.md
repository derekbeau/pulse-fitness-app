# PR 125 — Private progress-photo UI

## Execution contract

Implement the complete private progress-photo experience in this worktree. The approved base is `main` at `cb930d7e9a235d2a367ca53c05091094bb06143a` (the merged secure progress-photo API). Do not modify the API contract, production configuration, production keys, live data, deployment, Foundry, or external services. Use synthetic fixtures only. Do not add real photos, placeholder media, public media URLs, body-fat/image analysis, fake AI, E2EE claims, or plaintext media in browser persistence.

Start by confirming the actual cwd, branch, clean status, and exact base SHA. Read this goal and the live API/shared contracts before editing. Preserve unrelated worktrees and untracked files in the main checkout.

## Product outcome

Extend the existing `/body` Body Progress area with an honest, private progress-photo workflow that uses the merged `/api/v1/body-progress` API exactly as implemented. Users can understand consent/privacy, configure cadence and side view, create a dated photo set optionally linked to an owned body check-in, capture or select photos for the supported views, upload with clear progress/retry states, see a dated timeline, open private full images, compare the same pose across dated sets, edit metadata/notes, delete a photo or set, and revoke consent. The UI must remain useful with missing photos, partial sets, errors, and denied capture permissions.

Match existing Body Progress page/detail patterns, tokens, controls, routing, query invalidation, confirmation dialogs, accessible labels, and dark/light responsive treatment. Do not redesign unrelated body-check-in flows.

## Authoritative live contracts

Read and use the exact schemas and route behavior from:

- `packages/shared/src/schemas/body-progress-photos.ts`
- `apps/api/src/routes/body-progress-photos/index.ts`
- `apps/api/src/routes/body-progress-photos/store.ts`
- `apps/api/src/routes/body-progress-photos/media.ts`
- `docs/conventions/api-conventions.md` (private progress-photo section)
- `apps/web/src/pages/body-progress.tsx`
- `apps/web/src/pages/body-check-in-detail.tsx`
- `apps/web/src/features/body-progress/api/body-progress.ts`
- `apps/web/src/features/body-progress/body-progress-fixtures.ts`
- `apps/web/src/App.tsx`

API facts that are binding:

- Base routes are `/api/v1/body-progress/photos/preferences`, `/photo-sets`, `/photo-sets/:id`, `/photo-sets/:id/photos`, `/photos/:id/content?variant=thumbnail|comparison|full`, `/photos/:id`, `/photos`, and `/photos/export`.
- Preference, due, capability, and set metadata reads accept either `Authorization: Bearer <JWT>` or `Authorization: AgentToken <token>` through the existing web client. Mutations, multipart upload, private content, deletion, purge, and password-reauthenticated export are JWT-only. Never expose credentials or make a content URL public.
- Success data is the existing `{ data: T }` or paginated `{ data, meta }` envelope and the existing `apiRequest`/`apiRequestWithMeta` helpers unwrap it. Do not hand-roll auth or a second client.
- A set has `id`, nullable owned `bodyCheckInId`, `date`, nullable `localTime`, `guideVersion`, context (`meal`, `workout`, pump, bloating, clothing/lighting notes), nullable notes, `partial|complete` status, scheduled-occurrence flag, photos, timestamps.
- A photo is normalized `image/jpeg`, one of `front|side_left|side_right|back`, with server checksum, processing/encryption versions, and authenticated thumbnail/comparison/full variant paths. Do not render `contentPath` as an unauthenticated/public `<img>` source without the client auth mechanism; fetch authenticated bytes through the existing client and create/revoke object URLs.
- Upload is JWT-only multipart with up to three files, one per view, each JPEG/PNG/WebP, 12 MiB input limit, 40M pixel limit, and 3-file request limit. HEIC/HEIF is deliberately rejected by the server with `BODY_PROGRESS_PHOTO_HEIC_CLIENT_CONVERSION_REQUIRED`; do not assume browser HEIC decoding or silently convert. Detect/report the capability honestly and offer only an explicitly supported conversion path if the repository already has one; otherwise tell the user to choose JPEG/PNG/WebP.
- Consent facts are authoritative: encrypted live storage, JWT-only raw access, retained until explicit deletion, newest 30 encrypted backup archives, separate backup key, and no AI analysis. Display these accurately without claiming client-side E2EE.
- Never persist image bytes, plaintext object URLs, data URLs, file contents, or photo metadata in localStorage, sessionStorage, IndexedDB, Cache Storage, service workers, browser logs, analytics, or query persistence. Revoke every object URL on replacement, unmount, error, and successful cleanup.
- Missing/invalid/key/storage/integrity/size/count/duplicate-view/unsupported-format/HEIC/consent/forbidden/not-found errors must map to stable user-facing copy and preserve existing data on failed mutation.

## Required views and behavior

1. **Body Progress entry**: Add a clearly labeled private-photo section/card to `/body`, separate from circumference analytics. Show consent state, due/scheduled state, latest set/timeline entry, setup/upload actions, and a link to the existing body check-in when a set is linked. No image should load until the user opens the private-photo surface and the request is authenticated.
2. **Consent/privacy**: First-use explanation, grant/decline/revoke states, exact privacy facts above, no forced camera permission, and a safe declined/revoked state. Revoking consent must not silently delete; provide the explicit deletion action and refresh behavior. Mutations are disabled or explained when consent is absent/revoked.
3. **Preferences/due**: Use server preference/capabilities. Support cadence 14–180 days, preserve/restart anchor semantics, side-view preference, reminder time, skip/snooze where exposed. Do not invent local scheduling.
4. **Capture/upload**: Support camera capture where the browser grants permission and file selection as the reliable alternative. If permission is denied/unavailable, keep file upload usable. Show accepted formats and size/pixel/file limits from capabilities. Show selected-file previews only in memory, explicit view assignment, replacement, duplicate-view prevention, per-file and aggregate progress where possible, retry of failed upload, cancellation/cleanup, partial success consistency, and a clear safe retry state. Do not claim a set is complete until the server returns it complete.
5. **Set metadata**: Create a partial set using the exact guide version; support date/local time, optional owned body-check-in link, context, notes, and scheduled-occurrence flag. Patch only fields supported by `patchBodyProgressPhotoSetSchema`; body-check-in selection must be loaded from owned metadata and must not permit arbitrary IDs.
6. **Timeline**: List server-paginated dated sets newest-first with partial/complete badges, available views, optional check-in link, notes/context indicators, loading/empty/error/retry states, and no public URLs. Open a set detail route or stable in-page detail without losing navigation context.
7. **Private viewing**: Use authenticated thumbnail/comparison/full endpoints and in-memory blob/object URLs only. Provide alt text that identifies pose/date without body-analysis claims. Handle missing image, 401/403, 404, integrity, key/storage failure, and retry. Avoid preload of every full image.
8. **Comparison**: Select two or more dated sets and one exact shared pose; show same-pose comparison only, dates/source metadata, and an explicit note that lighting/clothing/pose/context affect visual comparison. Do not infer body-fat or muscle changes. Handle no shared pose and missing variant states. Revoke comparison URLs.
9. **Correction and deletion**: Edit supported set metadata/notes and preserve server truth. Delete one photo, a set, or use the existing explicit delete-all flow only where appropriate; require confirmation and show exact returned counts. Never promise restore. Refresh timeline/detail after mutations.
10. **Accessibility/responsive**: Verify keyboard-only operation and visible focus for every action, semantic labels/roles and live upload/error status, no focus traps outside existing dialog primitives, reduced-motion behavior, touch-safe controls, and no horizontal overflow at 320/375/390/430/768/1280px. Mobile and desktop must both be intentionally laid out. Camera/file controls must remain reachable by keyboard.

## Implementation boundaries

Prefer a focused `apps/web/src/features/body-progress/photos/` module with colocated API hooks, query keys, components, fixtures, and tests, plus the smallest route/page additions necessary. Reuse existing UI primitives, `api-client`, `useConfirmation`, query invalidation, and body page patterns. Do not add a new state library, media server, browser cache, service worker, auth scheme, or storage abstraction. Keep server-derived state in TanStack Query; ephemeral selected files/object URLs belong in component state and cleanup effects.

Use Node 24 and the repository's existing pnpm lockfile/runtime. Do not change production configuration. Test keys, if needed by existing harness conventions, must be scoped synthetic fixtures only and must not be committed as secrets.

## Verification contract

Focused tests first, then the final complete agreed gate after repairs:

- shared/API contract tests for the exact schemas, auth split, HEIC gate, limits, error codes, user scoping, private headers, no public route, and blob retrieval behavior;
- focused web component tests with synthetic fixtures for consent, preferences, set creation, optional check-in link, timeline, same-pose comparison, metadata notes, correction, photo/set deletion, retry/error/partial upload, missing image, object URL revocation, and no persistence/logging;
- integration tests for authenticated fetches, multipart field names/view mapping, request failure preserving state, and JWT-only mutation behavior;
- existing lint, typecheck, and relevant unit/test commands; run the strongest full repository checks practical under Node 24;
- one real-browser acceptance pass using only synthetic fixture media: desktop and mobile widths, populated timeline, keyboard path, reduced motion, denied camera permission/file fallback, malformed/unsupported/HEIC rejection, missing image, upload retry/partial consistency, same-pose comparison, correction, deletion, network/console inspection, and uncached reload. Capture screenshots at representative mobile/desktop widths and retain raw stdout/stderr and exit codes.

Final evidence must bind to the exact final commit SHA, source/config/lockfile identity, fixture versions, and browser screenshots/readbacks. No fake photos or placeholder media count as evidence. Confirm no credentials, production keys, live DB, external services, deployment, or production control were used.

## Completion report

Return: exact cwd, branch, base SHA and final SHA; changed files; clean/dirty status; focused and full command results with raw receipt paths; browser URL/route and viewport widths; screenshot paths; console/network findings; privacy/security checks; known limitations; and explicit confirmation that prohibited external actions were not taken. Create a Conventional Commit only if the lane's execution policy requests it; otherwise leave the implementation for independent review as instructed by the launcher.
