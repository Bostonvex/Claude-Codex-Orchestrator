# Install & run

A Claude Code skill is invocable either **globally** (from `~/.claude/skills/`, available in
every project) or **per-repo** (from `<target-repo>/.claude/skills/`). This repo is where the
skill is *authored and versioned* — prefer a symlink so edits here take effect immediately.

## 1. Install the skill

### Global (personal skill — recommended, current setup)

```bash
mkdir -p "$HOME/.claude/skills"
ln -sfn "$HOME/Code/codex-loop/skills/codex-loop" "$HOME/.claude/skills/codex-loop"
```

`/codex-loop` is now invocable from any repo. **Because it is global, the skill checks its
target first** (see the skill's "Applicability" section): it only runs the iteration when the
working repo is `Bostonvex/auspicia` — or another repo you explicitly point it at that
provides the same Control Tower issue + `agent:*`/`loop:ready` labels + `LOOP:*` comment
grammar. Invoked anywhere else it is a no-op with an explanation, not a wrong-repo action.

### Per-repo (scoped alternative)

Use this instead if you want it only in one checkout. **Symlink** keeps a single source of
truth; **copy** is a vendored snapshot.

```bash
TARGET="$HOME/Code/AnlayticsFrontend"       # the auspicia working copy
SRC="$HOME/Code/codex-loop/skills/codex-loop"
mkdir -p "$TARGET/.claude/skills"
ln -s "$SRC" "$TARGET/.claude/skills/codex-loop"     # or: cp -R "$SRC" "$TARGET/.claude/skills/codex-loop"
```

Reopen the Claude Code session so it picks up the new skill; `/codex-loop` should appear in
the skills list.

## 2. Preconditions

- `gh` authenticated for `Bostonvex/auspicia`.
- For the **local** worker: the `codex` plugin installed and `codex` CLI authenticated
  (`/codex:setup` verifies this).
- Clean working tree in the target repo before starting.
- The Control Tower issue (#175) reachable and its `LOOP:STATE` token set to `RUN` (or
  absent) — not `PAUSE`.

## 3. Run — interactive, one tick

```
/codex-loop
```

Runs a single iteration of the engine (verify → backend → frontend → deploy → log) and
stops. Use this to dry-run and watch behaviour before handing it the cadence.

## 4. Run — autonomous, self-paced (eliminates manual restarts)

Wrap the engine in a self-paced `/loop`:

```
/loop /codex-loop
```

Each wake runs one iteration; the engine's PACE step schedules the next via
`ScheduleWakeup` (tight ~270s while a PR/deploy is in flight, ~600–900s for ordinary
progress, halt when drained). `LOOP:STATE=PAUSE` on #175 is the soft kill switch — the loop
backs off and auto-resumes when you set it back to `RUN`.

To stop: set `LOOP:STATE=PAUSE`, or interrupt the session.

## 5. Run — unattended cron (future, gated)

Not enabled by default. auspicia deliberately disabled the headless driver
("interactive-only"). Before turning this on, resolve the two blockers in
[ROADMAP.md](ROADMAP.md#phase-3--unattended-cron-gated): understand why headless was
disabled, and confirm headless `gh` + MCP auth. Then it would be a `/schedule` routine
invoking `/codex-loop`.

## Choosing the worker

| Want | Set |
|---|---|
| today's fire-and-forget behaviour | cloud worker (default) |
| no idle gap, in-session, on your machine | local worker |
| both, per issue | hybrid via `worker:local` / `worker:cloud` labels |

See [DESIGN.md §3](DESIGN.md#3-the-engine-one-iteration).
