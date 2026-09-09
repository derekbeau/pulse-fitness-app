# Pulse #151 evidence

Raw combined stdout/stderr receipts and adjacent machine-readable JSON metadata are retained from
the first executed gate. Failed attempts remain immutable and are marked superseded only by later
passing receipts; they are never rewritten into passes.

The receipt harness records argv, UTC timestamps, branch, tested Git commit, dirty patch hash,
environment-safe cache controls, combined-output hash, raw-log hash, and exit code. Final source
hashes and the authoritative command/result index are generated only after product and test source
stops changing.

The completed executor summary is in `acceptance-report.md`; `manifest.json` is the machine-readable
index, and `source-hashes.sha256` binds the tested source tree. The final commit is necessarily an
evidence-only descendant of the tested source commit because a commit cannot embed its own hash.
