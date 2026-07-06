# Install & run

`/codex-loop` is repo-agnostic: install it once, invoke it in any repo, and it detects/scaffolds
what that repo needs.

## 1. Install the skill

### Global (personal skill — recommended, current setup)

```bash
mkdir -p "$HOME/.claude/skills"
ln -sfn "$HOME/Code/codex-loop/skills/codex-loop" "$HOME/.claude/skills/codex-loop"
```

Symlinking back to this repo keeps a single source of truth (edit here, runs everywhere).
`/codex-loop` is now invocable from any project.

### Per-repo (scoped alternative)

A skill is also invocable from `<target-repo>/.claude/skills/`. Use this only if you want it
in one checkout:

```bash
ln -s "$HOME/Code/codex-loop/skills/codex-loop" "<target-repo>/.claude/skills/codex-loop"
```

Reopen the Claude Code session so it picks up the skill.

## 2. Preconditions

- `gh` authenticated for the target repo.
- For the **local** worker (**the default**): the `codex` CLI installed and authenticated
  (`codex doctor` verifies this) — the loop drives it via `codex exec`. If you can't run Codex
  locally, set `worker=cloud` in the Control Tower config instead.
- Clean working tree before starting.

## 3. First run in a repo — auto-detect + scaffold

Invoke `/codex-loop`. It will:

1. Identify the repo and look for a `codex-loop:control` issue.
2. **If not set up:** explain what's missing and offer to create the label set + a pinned
   Control Tower issue seeded with a config block. It asks you to confirm (and to set
   `deploy`/`verify`/`priority`, or take defaults) before creating anything.
3. After setup it stops. Add your first `agent:codex` / `agent:claude` + `loop:ready` issues,
   then run again.

Tune the loop any time by editing the `CODEX-LOOP:CONFIG` block in the Control Tower issue
body:

```
<!-- CODEX-LOOP:CONFIG
state=RUN            # RUN | PAUSE — kill switch
worker=local         # local | cloud | hybrid  (default: local)
deploy=              # deploy command; empty = never deploy
verify=              # CI command(s); empty = auto-detect
priority=number      # "number" or comma-separated backlog file paths
mode=sequential      # sequential | wave  (parallelism; see ORCHESTRATION.md)
concurrency=1        # max issues implemented at once in wave mode
gates=verify         # verify,lint,typecheck,review,cleanup — gates before merge
trailer=Co-Authored-By: Claude <noreply@anthropic.com>
-->
```

## 4. Run — one tick

```
/codex-loop
```

Runs a single iteration (verify → assign/implement → deploy → log) and stops. Use this to
watch behaviour before handing it the cadence.

## 5. Run — autonomous, self-paced (eliminates manual restarts)

```
/loop /codex-loop
```

Each wake runs one iteration; the engine schedules the next via `ScheduleWakeup` (tight while
a PR/deploy is in flight, back off when idle, halt when drained). Set `state=PAUSE` in the
Control Tower config to pause — the loop backs off and auto-resumes when you set it back to
`RUN`. To stop entirely, pause or interrupt the session.

## 6. Run — unattended cron (future, gated)

Not enabled by default. A `/schedule` routine invoking `/codex-loop` would run it headless.
Before enabling, confirm headless `gh`/MCP auth and the target repo's own policy on
unattended execution. See [ROADMAP.md](ROADMAP.md).

## Choosing the worker

| Want | Set in config |
|---|---|
| fire-and-forget | `worker=cloud` |
| no idle gap, in-session | `worker=local` |
| both, per issue | `worker=hybrid` + `worker:local` / `worker:cloud` labels |
