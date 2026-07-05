# Design

## 1. The problem: two stall points

The auspicia loop has two independent places where it stops and waits for a human:

1. **Codex idles after a PR.** Cloud Codex only acts on an *assigned* issue. Once it
   returns a `codex/*` PR, it has nothing to do until the orchestrator verifies that PR and
   assigns the next issue.
2. **The orchestrator idles after a tick.** `/loop-tick` runs exactly once and stops
   ("do not self-schedule"). Nothing re-fires it — a human does.

The "manual restart" the user feels is **#2**. Fixing #2 also fixes #1, because a tick is
what assigns Codex its next issue. So the whole design is about **automating the
orchestrator's cadence** and, optionally, **removing the async gap entirely**.

Historical note: auspicia's `loop-tick.md` marks the headless `claude -p` / launchd driver
as **deliberately disabled** — "loop execution is interactive-only." codex-loop respects
that: the default cadence runs inside an interactive session. A headless/cron path is
documented as a *gated* future step (see ROADMAP), not silently re-enabled.

## 2. Architecture: engine + cadence, decoupled

```
  ┌─────────────────────────────────────────────────────────────┐
  │  CADENCE LAYER  (when does a tick run?)                      │
  │  • interactive /loop, self-paced via ScheduleWakeup          │
  │  • (future, gated) /schedule cloud cron routine              │
  └───────────────────────────┬─────────────────────────────────┘
                              │ invokes each iteration
                              ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  ENGINE  =  the /codex-loop skill  (what one tick does)      │
  │                                                             │
  │  guard → verify PRs → assign/implement backend → do frontend │
  │        → deploy → log to Control Tower issue                 │
  │                                                             │
  │  backend worker is pluggable:                               │
  │     • CLOUD  : label issue + LOOP:ASSIGN, await codex/* PR   │
  │     • LOCAL  : codex:codex-rescue --write in a worktree      │
  └───────────────────────────┬─────────────────────────────────┘
                              │ reads + writes
                              ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  STATE  =  GitHub issues  (labels + LOOP:* comment grammar)  │
  │  the ONLY source of truth; survives restarts                 │
  └─────────────────────────────────────────────────────────────┘
```

Keeping cadence and engine separate is deliberate: you can run the same engine by hand
(`/codex-loop`), under self-paced `/loop`, or under a cron routine, without changing the
engine.

## 3. The engine (one iteration)

Mirrors auspicia's canonical tick (steps from `loop-tick.md`), with the backend worker made
pluggable and a pacing decision appended.

```
ITERATION:
  git fetch origin; read Control Tower issue (#175)

  ── GUARD (runs first, every iteration) ─────────────────────────
  if first LOOP:STATE token == PAUSE:   say "paused"; back off; return
  if working tree dirty:                report; STOP           # never plow over state

  ── VERIFY CODEX PRs FIRST ──────────────────────────────────────
  for each issue whose newest comment is LOOP:STATUS state=pr-open
      with no later LOOP:VERIFY from me:
    gh pr checkout <n>; run Verification Plan + CI; review diff vs Acceptance + guardrails
    pass → gh pr merge --squash; LOOP:VERIFY verdict=pass; close; unblock chain successor
    fail → LOOP:VERIFY verdict=bounce with reproducible findings; leave loop:ready
           two consecutive bounces on one issue → needs:human

  ── BACKEND (pluggable worker) ──────────────────────────────────
  issue = next ready backend issue (IRIS-BACKLOG → ROADMAP → issue number)
  if park-condition(issue):  needs:human; note; continue        # see §5
  freeze contract in issue body if not frozen
  WORKER == CLOUD:  label agent:codex loop:ready backend; post LOOP:ASSIGN contract=frozen
  WORKER == LOCAL:  wt = fresh worktree off origin/main
                    codex:codex-rescue --write "implement NN per frozen contract; cwd=wt"
                    run CI + Verification Plan in wt
                    pass → commit (Co-Authored-By trailer) → push origin HEAD:main
                           → close → unblock successor
                    fail → re-hand once via --resume with findings; 2nd fail → needs:human

  ── FRONTEND (Claude implements directly) ───────────────────────
  git fetch origin && git reset --hard origin/main
  do ONE agent:claude loop:ready issue → CI green → push origin HEAD:main → close

  ── DEPLOY ──────────────────────────────────────────────────────
  for each issue merged/closed this iteration whose Deployment Expectation asks:
    scripts/deploy-vps.sh (health-gated); smoke-check; record in handover

  ── LOG ─────────────────────────────────────────────────────────
  append one comment to #175: queue counts, assigned/verified/merged/deployed, parked, blockers

  ── PACE (this replaces the manual restart) ─────────────────────
  if a PR is mid-CI or a deploy is settling:  wake in ~270s   (warm prompt cache, poll tight)
  elif work happened this iteration:          wake in ~600s
  elif both queues drained:                   note "queue drained"; STOP loop
  else:                                        wake in ~900s
```

### CLOUD vs LOCAL worker

- **CLOUD** preserves today's design: fire-and-forget, but the verify step lands on a
  *later* iteration (the idle gap persists — only the *orchestrator's* restart is
  automated).
- **LOCAL** collapses async → synchronous: `codex:codex-rescue` runs Codex against a
  worktree and returns the diff in the *same* iteration, so verify happens immediately and
  the "Codex sits idle" state never exists. Cost: runs on your machine, session open.
- **HYBRID** (recommended target): LOCAL for small/urgent issues, CLOUD for large issues
  you're happy to leave running. The engine picks per-issue by a label (e.g. `worker:local`
  / `worker:cloud`) or size heuristic.

## 4. The cadence layer

### Interactive, self-paced (default — sanctioned today)

Run the engine wrapped in a self-paced `/loop`. Each wake runs one iteration, then the
PACE block schedules the next via `ScheduleWakeup`:

- **~270s** while a PR is in CI or a deploy is settling — stays inside the 5-min prompt
  cache window, so polling is cheap.
- **~600–900s** for ordinary progress.
- **STOP** when both queues drain (or long idle back-off ~1800s if you prefer it to linger).
- **PAUSE** is soft: back off ~1800s and re-check, so un-pausing `#175` auto-resumes the
  loop instead of needing a hand-restart.

Why self-paced beats a fixed `/loop 10m`: it only polls tight while something is actually
in flight, and exits/back-offs when idle — no full tick burned every 10 minutes on an empty
queue.

### Cloud cron (future, gated — see ROADMAP)

A `/schedule` routine could run the engine headless on a cron so it advances with the
laptop closed. This re-enables the headless path auspicia disabled on purpose, so it is
gated on: (a) understanding *why* it was disabled, and (b) headless auth for `gh` + any MCP.

## 5. Guardrails (inherited verbatim, never weakened)

The engine calls these **every iteration** — they are inside the guard/park path, not
optional:

- **PAUSE.** First `LOOP:STATE=PAUSE` token on the Control Tower issue → no-op and halt.
- **Park for human** (`needs:human` + note, do NOT act): vendor spend/licensing (#118),
  agreements/legal (#119), external-facing comms, destructive/irreversible migrations not
  explicitly authorized in the issue, and anything genuinely ambiguous. **When unsure, park.**
- **CI green before merge/deploy.** Never leave `main` red; fix-forward or revert in the
  same iteration if a push reddens it.
- **Additive/idempotent DDL**; tables pre-created as `tap`; no reseed/drop of live data;
  preserve audit trails (`llm_requests`, `assessments`, `cost_events`).
- **Deploy only when the issue asks.**
- **Commit messages end with the `Co-Authored-By` trailer.**
- **Work survives only via `git push origin HEAD:main`** (worktrees are discarded).

The single largest risk in autonomy is not the looping — it is a loop that skips the
park-for-human check. That check runs before any assign/merge/deploy, every iteration, by
construction.

## 6. Stop conditions (must exist before cadence goes live)

The engine halts — cleanly, not by crashing — on any of:

- `LOOP:STATE=PAUSE`
- both actionable queues drained ("queue drained")
- dirty working tree it did not create
- max-iterations backstop hit (cost ceiling)
- an issue that hits the park conditions (that issue is parked; the loop continues to others)
