# Working with worktrees

Use the tracked initializer for feature work. Do not assemble a worktree by copying `.env`, databases,
or `node_modules` by hand.

## Create a ready-to-run worktree

Run this from the primary `pulse-fitness-app` checkout while the production OrbStack API container is
running:

```bash
pnpm worktree:init -- codex/my-feature
```

The default worktree is created beside the primary checkout. For the example above it is
`../pulse-fitness-app-codex-my-feature`. The command:

1. refreshes `origin` and creates the branch from `origin/main`;
2. reserves unused API and web ports across existing Pulse worktrees;
3. uses SQLite's online backup command inside `pulse-fitness-app-api-1` for a consistent production
   snapshot;
4. writes the ignored snapshot to `apps/api/data/pulse-worktree.db` with mode `0600`;
5. writes an ignored `.env` with the snapshot path, isolated ports, and loopback-only hosts;
6. installs the locked pnpm dependencies; and
7. starts both development servers, verifies their health, then stops them.

After it succeeds:

```bash
cd ../pulse-fitness-app-codex-my-feature
pnpm dev
```

The command prints the exact API and web URLs assigned to that worktree.

## Options

```text
pnpm worktree:init -- <branch> [path] [options]

--base=<ref>         Starting ref for a new branch (default: origin/main)
--api-port=<port>    Reserve a specific API port
--web-port=<port>    Reserve a specific Vite port
--container=<name>   Production API container name
--no-fetch           Do not refresh origin before resolving the base ref
--skip-smoke         Skip the final API/web startup proof
```

An existing local branch is attached directly. If only `origin/<branch>` exists, the initializer
creates a tracking branch. Supply an explicit absolute path when the default sibling path is not
appropriate:

```bash
pnpm worktree:init -- codex/my-feature /Users/meridian/Projects/pulse-my-feature
```

`--skip-smoke` is intended only for diagnosing a broken branch; a worktree initialized with it has not
been proven runnable.

## Data and network safety

The worktree database contains production health data. It is ignored by Git, mode `0600`, and must not
be copied into fixtures, attached to issues, or committed. The generated environment binds both API and
Vite to `127.0.0.1`; do not change either host when using the production-derived snapshot.

The initializer never opens the production database directly from the host and never runs migrations
against it. SQLite creates a point-in-time copy inside the container, then all startup migrations run
only against the worktree copy.

For a shareable browser preview, use the sanitized Gate 0 fixture workflow instead:

```bash
pnpm dev:gate0
```

Never expose a production-derived worktree over Tailscale, a LAN address, or `0.0.0.0`.

## Cleanup

Commit or move any wanted changes first, then run these from the primary checkout:

```bash
git worktree remove /absolute/path/to/worktree
git branch -d codex/my-feature
git push origin --delete codex/my-feature  # only if the remote branch still exists
git worktree prune
```

Use `git status` inside the worktree before removing it. Do not force-remove a dirty worktree just to
make cleanup convenient.

## Troubleshooting

- **Production container is unavailable:** start or repair OrbStack production first; the initializer
  fails before creating a branch when it cannot take a consistent snapshot.
- **A port is reserved:** omit the explicit port and let the initializer choose the next unused one.
- **Startup proof fails:** the worktree is retained for inspection. Read the captured failure output,
  fix the branch, then run `pnpm dev` from that worktree.
- **The database should not contain production data:** remove the ignored worktree database and use the
  deterministic Gate 0 fixture workflow instead.
