# Consolidated review dispositions

Reviewer: internal `startup_review`, explicitly requested `gpt-5.6-luna`, medium. No Fast runtime readback was available or claimed; model/effort/Fast UI verification was not an acceptance gate. No native Codex UI was inspected.

## Timeout repair review

- Native Buffer equality retains exact content and length comparisons for every existing serialized-SQLite rollback assertion. Distinct equal copy, changed last byte, and truncation controls verify both positive and negative paths. No existing merge/restore/ownership assertions were removed or changed.
- Worker startup now reports bootstrap, DB open, full API import and API ready; IPC registers before imports and queues commands until readiness. `online` remains strictly after `await app.ready()`. An initial suggestion to use an earlier online handshake was **not adopted**, because it would weaken the existing readiness contract.
- Startup import failures report fatal IPC; parent error/signal exits wake pending waiters promptly; teardown handles already exited/unspawned children. The 5,000ms wait and 15,000ms API test deadline are unchanged. Real independent processes/connections, barriers, lock induction, bounded write retries and all seven assertions are retained.
- Reviewer found no additional actionable readiness or teardown defects. Normal teardown's internal fatal marker is diagnostic-only after the test's waits and does not change proof or acceptance.

## Browser harness review

- One finding: a stale built-in-browser receipt from an earlier run at the same HEAD could satisfy the handoff. **Fixed** by generating a new UUID in the exclusive preflight, carrying it through live server/DB ownership, and requiring the handoff's identical run ID and HEAD. The API/SQLite receipt records the same run ID.
- Reviewer confirmed exact wrapper variables, absence checks, exclusive owner marker, one listener per assigned port, owning process cwd and API DB descriptor checks, `reuseExistingServer: false`, no browser-test retries, API/SQLite assertions, categorical-only OpenAPI keys, preserved shorthand scoring, and strict console/network diagnostics.
- Existing root Playwright configuration supplies networking/readiness and Vite invocation. Only the artifact config's API command bypasses the missing `.env` loader, with explicit fictional process-local credentials and loopback HOST. No `.env` or other persisted environment configuration was created or edited.
- One Playwright worker is for one isolated browser receipt, not a change to repository test concurrency. The explicit 180-second built-in-browser handoff is outside tests and preserves all existing deadlines; it cannot turn a failing test green.

## Preserved independent-review fixes

IR-1 categorical ranking and IR-2 transaction/locking fixes were independently verified before this follow-up. `invariant-hashes.json` records unchanged application logic, shared schemas and frozen contract. The real write unit still acquires BEGIN IMMEDIATE before owner-local re-read, commits food/current meal/items/usage atomically, retries only BUSY/LOCKED at most four attempts with 25/50/100ms backoff, and emits created outcomes only after commit. No new policy, alias storage, migration, auto-binding, promotion or historical rewrite was introduced here.

No unresolved in-scope finding remains from the consolidated internal review. This is implementer verification, not independent acceptance.

## Execution-discovered harness correction

The first real browser harness invocation failed before DB creation because Playwright concatenates `webServer` arrays passed through separate `defineConfig` arguments. The executor replaced that merge with one object spreading the inherited base and overriding the array. Readback asserts exactly two owned commands. The fix is commit `56bec515b8bc1bf23585f62f3f7cab03e840cea4`; the initial failure is retained unchanged in `failed-startup/`. The subsequent browser test passed in 3.2 seconds after a real fresh built-in-browser visit; no test retries or assertions changed. All app/test/docs/config trees used by the earlier four uncached gates are identical, as recorded in `gate-source-binding.json`.
