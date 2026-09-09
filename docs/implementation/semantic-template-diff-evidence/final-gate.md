# Pulse #152 final uncached gate

- Tested implementation HEAD: `873de43323d43a61200dce5bc717488b802c451b`
- Required base and merge base: `6672b57599f2da4e3794ed02dc79879b7c27332a`
- Cache control: `TURBO_FORCE=true`; every Turbo task reported `Cached: 0 cached`.
- Source/test binding: `source-test-sha256.txt`

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm test` | 0 | shared 728, API 1241, web 1418 tests passed |
| `pnpm typecheck` | 0 | 3/3 package tasks passed |
| `pnpm lint` | 0 | 3/3 package tasks passed; 6 pre-existing Fast Refresh warnings in unchanged files, 0 errors |
| `pnpm build` | 0 | 3/3 package tasks passed; existing Vite chunk-size advisory only |
| `git diff --check HEAD^ HEAD` | 0 | no whitespace errors |

Raw logs are retained beside this file as `final-test.log`, `final-typecheck.log`, `final-lint.log`, and `final-build.log`.

The post-gate amend added only evidence metadata, raw logs, and the hash manifest after the tested implementation HEAD. The manifest binds every changed source and test file so the final delivery SHA can be checked for source equivalence without rerunning the gate.
