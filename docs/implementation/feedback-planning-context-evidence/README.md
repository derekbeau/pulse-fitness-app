# Pulse #151 evidence

Raw combined stdout/stderr receipts and adjacent machine-readable JSON metadata are retained from
the first executed gate. Failed attempts remain immutable and are marked superseded only by later
passing receipts; they are never rewritten into passes.

The receipt harness records argv, UTC timestamps, branch, tested Git commit, dirty patch hash,
environment-safe cache controls, combined-output hash, raw-log hash, and exit code. Final source
hashes and the authoritative command/result index are generated only after product and test source
stops changing.
