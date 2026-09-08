# Pulse #150 acceptance evidence

This directory is the retained evidence package for PR #163. The implementation reviewed at
`53d728c0936cd4756a0c5cc15aa6fe70cc064fca` is unchanged. A test-only clock correction was committed
at `ea4ca7688c5c022abfa38affba424d150b07ee5a`, and every final authoritative receipt was captured
against that exact source commit.

`source-hashes.sha256` conservatively hashes every tracked file outside this evidence directory
(1,559 files), including every source, test, migration, package, lockfile, and configuration input.
`raw/11-source-hash-verification.log` records a successful full manifest verification. The final PR
head is an evidence-only descendant of the tested source commit, so reviewers can recompute the
manifest from the PR head without a self-referential commit hash in the checked-in receipts.

The authoritative command receipts are under `raw/`; each contains the exact command, combined raw
stdout/stderr, start/end time, tested commit, branch, worktree, and exit code. See `raw/README.md` for
the authority and supersession map. Earlier narrative-only results are superseded.

The Playwright configuration starts only local API/web services against disposable SQLite under
`/tmp` and uses bundled Chromium. The retained JSON includes scheduled/session API readbacks,
immutable correction history, an accessibility snapshot, and console/network output. Screenshots
are retained at 375 px and 1280 px widths. The one 503 is an `EXPECTED SYNTHETIC FAILURE-PATH` used
to prove failed-save visibility and retry; the artifact audit separately proves zero unexpected
page errors, console errors, or network failures.

SQLite downgrade is restore-based: the migration test retains an untouched through-0061 synthetic
copy, applies 0062 to a separate copy, verifies legacy bytes and integrity, reapplies idempotently,
then restores and compares the predecessor. A separate test installs the full current journal on an
empty database, and another proves transactional rollback. There is no destructive down migration.

No production service/database, live migration, deployment, merge, native Codex UI, Desktop
automation, CUA, installed Chrome, or historical-data rewrite was used.
