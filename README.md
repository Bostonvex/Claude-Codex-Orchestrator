# codex-loop

An autonomous orchestration engine that lets **Claude Code control the backend work
handed to Codex** — using **GitHub issues as the single source of truth for state and
tracking** — and **eliminates the manual "kick the loop again" step**.

It is the productised version of the two-agent Auspicia loop: Claude orchestrates,
verifies, merges, and deploys; Codex implements assigned backend work. Today that loop
stops whenever the queue momentarily empties or a tick ends, and a human has to restart
it. codex-loop closes that gap.

## Objective

> Have Claude control the work that goes to Codex via GitHub issues (for state + tracking),
> and eliminate manual restarts.

Two concrete outcomes:

1. **Issue-driven control.** Every unit of work is a GitHub issue. Its labels + a small
   comment grammar (`LOOP:*` markers) *are* the state machine — assignment, in-flight,
   PR-open, verified, parked. Nothing lives in Claude's head between ticks; state survives
   restarts because it lives in GitHub.
2. **No manual restarts.** The orchestrator paces itself (poll tight while work is in
   flight, back off when idle, halt cleanly when drained or paused) instead of running one
   tick and waiting for a human to re-run it.

## Two ways to hand work to Codex

codex-loop supports both Codex surfaces you already have, and treats them as
interchangeable workers behind the same issue-state model:

| Surface | What it is | Latency | Cost/where |
|---|---|---|---|
| **Cloud Codex** | ChatGPT cloud picks up `agent:codex loop:ready` issues, returns `codex/*` PRs | async (idle gap) | fire-and-forget |
| **Local Codex** | the `codex` plugin's `codex:codex-rescue` subagent → local `codex app-server` | synchronous, in-session | your machine |

The **idle gap** — Codex finishing a PR and then having nothing to do until the next tick —
is exactly what the synchronous local path removes: Claude feeds Codex the next issue the
instant the last one lands, so no independent Codex process ever sits idle.

## Layout

```
codex-loop/
├── README.md                     ← you are here
├── docs/
│   ├── DESIGN.md                 ← the full design: stall points, engine, cadence, guardrails
│   ├── ISSUE-PROTOCOL.md         ← the GitHub-issue state model + LOOP:* comment grammar
│   ├── INSTALL.md                ← how to install the skill into a target repo + run it
│   └── ROADMAP.md                ← staged plan, from "today" to fully unattended
└── skills/
    └── codex-loop/
        └── SKILL.md              ← the invocable /codex-loop orchestration skill (draft)
```

## Status

Design + skill draft. The skill is authored here but **must be installed into the repo it
drives** (a Claude skill is only invocable from `<target-repo>/.claude/skills/`). See
[docs/INSTALL.md](docs/INSTALL.md).

## Relationship to auspicia

This repo is the *engine and its documentation*. The loop it drives operates on
`Bostonvex/auspicia` — its issues, its `origin/main`, its `scripts/deploy-vps.sh`. The
authority model, guardrails, and comment grammar are inherited verbatim from auspicia's
`CLAUDE.md` and `docs/AGENT-LOOP-PROTOCOL.md`; this repo does not weaken them.
