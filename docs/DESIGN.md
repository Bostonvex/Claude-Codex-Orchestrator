# Design

## 1. The problem: two stall points

A Claude+Codex loop has two independent places where it stops and waits for a human:

1. **Codex idles after a PR.** Cloud Codex only acts on an *assigned* issue. Once it returns
   a PR, it has nothing to do until the orchestrator verifies it and assigns the next issue.
2. **The orchestrator idles after a tick.** A single tick runs once and stops; nothing
   re-fires it — a human does.

The "manual restart" is **#2**. Fixing #2 also fixes #1, because a tick is what assigns Codex
its next issue. So the design automates the **orchestrator's cadence** and, optionally,
**removes the async gap entirely** by running Codex synchronously in-session.

## 2. Architecture: detect → scaffold → iterate → pace

```
  A. DETECT   gh repo view → find codex-loop:control issue → parse CONFIG
              │  not set up? ──▶ B. SCAFFOLD (confirm → create labels + Control Tower issue)
              ▼
  C. ENGINE (one iteration, config-driven)
     guard → verify PRs → assign/implement Codex work → implement one Claude issue
           → deploy (if configured + asked) → log to Control Tower
     backend worker is pluggable:  CLOUD (label + LOOP:ASSIGN, await PR)
                                   LOCAL (codex:codex-rescue --write in a worktree)
              ▼
  D. PACE     interactive /loop, self-paced via ScheduleWakeup
              (poll tight while in flight, back off when idle, halt when drained/paused)

  STATE (throughout) = GitHub issues: labels + LOOP:* comments + Control Tower CONFIG block
```

Nothing project-specific lives in the skill. **All parameters** — deploy command, CI command,
priority order, worker mode, the kill switch — live in the Control Tower issue's config block
(see ISSUE-PROTOCOL.md). This is what makes one global skill drive any repo.

Cadence and engine stay decoupled: run the engine by hand (`/codex-loop`), under self-paced
`/loop`, or later under a cron routine, without changing the engine.

## 3. Auto-detect + scaffold (first run in a repo)

On every invocation the skill first checks state: identify the repo, look for the single
`codex-loop:control` issue, verify the label set. If it's missing, the skill **does not act
silently** — creating issues/labels is outward — it explains what's absent and offers to
scaffold: create the label set and a pinned Control Tower issue seeded with a config block
(asking for `deploy`/`verify`/`priority`, or using defaults). After setup it stops, so you
can populate the queue before running a tick.

## 4. The engine (one iteration)

Config-driven; see SKILL.md for the exact steps. Shape:

```
guard (PAUSE? dirty tree? park check) →
verify any state=pr-open Codex PRs (config verify cmd + issue plan; pass→merge, fail→bounce) →
next agent:codex issue: freeze contract → route by worker:
      cloud → label + LOOP:ASSIGN                    (verified on a later tick)
      local → worktree + codex:codex-rescue --write  (verified THIS tick) →
one agent:claude issue: implement → verify → push → close →
deploy (only if config deploy set AND issue asks) →
log tick to Control Tower issue → pace
```

### CLOUD vs LOCAL worker

- **CLOUD** — fire-and-forget; verify lands on a *later* iteration (idle gap persists; only
  the orchestrator restart is automated).
- **LOCAL** — `codex:codex-rescue` runs Codex against a worktree and returns the diff in the
  *same* iteration, so verify is immediate and Codex never sits idle. Cost: runs on your
  machine, session open.
- **HYBRID** — per-issue routing via `worker:local` / `worker:cloud` labels.

## 5. The cadence layer

### Interactive, self-paced (default)
Run the engine under a self-paced `/loop`. Each wake runs one iteration; then it schedules
the next via `ScheduleWakeup`: **~270s** while a PR is in CI or a deploy settles (inside the
prompt-cache window), **~600–900s** for ordinary progress, **STOP** when drained, **~1800s**
soft re-check while paused (auto-resumes on `state=RUN`). Beats a fixed `/loop 10m`: it only
polls tight when something is actually in flight.

### Cloud cron (future, gated — see ROADMAP)
A `/schedule` routine could run the engine headless. Gated on confirming headless `gh`/MCP
auth and on any target repo's own policy about unattended execution — the engine does not
assume it's allowed.

## 6. Guardrails (never weakened)

Called **every iteration**, inside the guard/park path — not optional:

- **PAUSE.** Config `state=PAUSE` → no-op and halt until `RUN`.
- **Park for human** (`needs:human` + note, do NOT act): money/vendor/licensing,
  legal/agreements, external-facing comms, destructive/irreversible migrations not explicitly
  authorized in the issue, and anything genuinely ambiguous. **When unsure, park.**
- **CI green before merge/deploy.** Never leave the default branch red.
- **Data safety.** Prefer additive/idempotent migrations; never reseed/drop live data or
  destroy audit trails without explicit issue authorization.
- **Deploy only when configured and the issue asks.**
- **Claude is the sole merger + deployer.** Codex never merges or deploys.
- **Work survives only via a push to the default branch** (worktrees are discarded).

The largest risk in autonomy is not the looping — it's a loop that skips the park check. That
check runs before any assign/merge/deploy, every iteration, by construction.

## 7. Stop conditions (halt cleanly on any)

`state=PAUSE` · both queues drained · dirty tree the loop didn't create · max-iterations
backstop (cost ceiling) · an issue that trips the park conditions (park it; continue the rest).
