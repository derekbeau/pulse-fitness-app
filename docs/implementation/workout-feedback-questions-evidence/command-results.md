# Pulse #150 final command results

This report was written only after the raw receipts existed. It supersedes every earlier narrative
result. Final-pass authority is the raw receipt plus `source-hashes.sha256`, not this summary.

## Commit and source binding

- Independently reviewed implementation candidate: `53d728c0936cd4756a0c5cc15aa6fe70cc064fca`.
- Exact final-gate source commit: `ea4ca7688c5c022abfa38affba424d150b07ee5a`.
- The only source/test change after the reviewed implementation is a test-clock correction: after a
  real-time pause/resume, completion now uses `Date.now()` instead of a fixed timestamp that had
  become earlier than the resumed segment. Product code and assertions were not weakened.
- Base SHA: `6326bd7b81219a4cf4d7b2e819e09369bf4a3946`.
- Prepared ancestor: `a2e6f7837022b46f663c74e52def9fd6d7856a94`.
- `source-hashes.sha256`: 1,559 deterministically sorted tracked files outside this evidence
  directory. Verification receipt: `raw/11-source-hash-verification.log`, exit 0.
- The final PR head is an evidence-only descendant of the exact tested source commit. Its SHA is
  intentionally reported by Git/PR rather than embedded self-referentially in its own commit.

## Authoritative final gates

All commands ran serially in `/Users/meridian/Projects/pulse-workout-feedback-questions` against
`ea4ca7688c5c022abfa38affba424d150b07ee5a`.

| Gate                   | Cache/serialization control                            |               Result | Raw receipt                         |
| ---------------------- | ------------------------------------------------------ | -------------------: | ----------------------------------- |
| Repository scripts     | Node test runner; no result cache                      |                15/15 | `raw/01-repo-tests.log`             |
| Shared tests           | `--maxWorkers=1 --no-file-parallelism --no-cache`      |    50 files, 724/724 | `raw/02-shared-tests.log`           |
| API tests              | `--maxWorkers=1 --no-file-parallelism --no-cache`      |  94 files, 1228/1228 | `raw/03-api-tests.log`              |
| Web tests              | `--maxWorkers=1 --no-file-parallelism --no-cache`      | 189 files, 1417/1417 | `raw/04-web-tests.log`              |
| Typecheck              | `TURBO_FORCE=true`; receipt shows 0 cached             |            3/3 tasks | `raw/05-typecheck.log`              |
| Lint                   | `TURBO_FORCE=true`; receipt shows 0 cached             |            3/3 tasks | `raw/06-lint.log`                   |
| Build                  | `TURBO_FORCE=true`; receipt shows 0 cached             |            3/3 tasks | `raw/07-build.log`                  |
| Migration acceptance   | serial Vitest, no cache, verbose names                 |                  3/3 | `raw/08-migration-acceptance.log`   |
| Synthetic Playwright   | one worker, zero retries, disposable local DB/services |                  1/1 | `raw/09-playwright-acceptance.log`  |
| Browser artifact audit | decoded retained JSON and hashed sources/artifacts     |               exit 0 | `raw/10-browser-evidence-audit.log` |

Lint retained six existing Fast Refresh warnings and zero errors. Build retained the existing Vite
large-chunk warning. Neither warning is a #150 failure.

## Browser acceptance

The Playwright JSON retains all four required attachments: scheduled API readback,
completed/corrected/deleted readback, accessibility tree, and console/network capture. The artifact
audit verifies the mobile screenshot is 375 px wide, the desktop screenshot is 1280 px wide, and
all browser source/artifact hashes.

The captured `PATCH /api/v1/workout-sessions/:id` 503 is `EXPECTED SYNTHETIC FAILURE-PATH`. It is
intentionally injected to prove the draft remains visible and retries successfully. Separately:

- unexpected page errors: 0;
- unexpected console errors: 0;
- unexpected network failures: 0.

## Migration acceptance

`raw/08-migration-acceptance.log` includes exact hashes for migration 0062, the journal, migration
test, and Drizzle schema. Its named tests prove:

- populated exact through-0061 predecessor to 0062 while preserving #149 feedback bytes;
- restore from the untouched predecessor plus integrity/row checks;
- migration reapplication idempotence;
- full current install on an empty database;
- owner links, exact revision order, immutable rows, and atomic rollback after an intentional
  synthetic exception.

The intentional rollback exception is expected inside a passing assertion; it is not a failed gate.

## Superseded failures

- `raw/01-repo-tests-SUPERSEDED-harness-error.log`: receipt harness used an invalid Node option;
  exit 9. The corrected final repository receipt passed.
- `raw/03-api-tests-SUPERSEDED-clock-drift.log`: reviewed candidate run exposed the fixed timestamp
  after real-time pause/resume; 1227/1228, exit 1. It is not final authority.
- `raw/03a-api-focused-SUPERSEDED-clock-drift.log`: isolated reproduction of that same test-clock
  failure; exit 1. It is not final authority.
- The older concurrent web timeout mentioned by the previous narrative was not retained as a raw
  receipt and was not reconstructed. It is superseded and is not evidence for the final pass.

## Safety

No production service/database, live migration, historical rewrite, deployment, merge, native
Codex UI, Desktop automation, CUA, installed Chrome, or environment/config change was used.
