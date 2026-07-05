# codex-loop

A **repo-agnostic** orchestration engine that lets **Claude Code control the work handed to
Codex** — using **GitHub issues as the single source of truth for state and tracking** — and
**eliminates the manual "kick the loop again" step**.

Claude orchestrates, verifies, merges, and deploys; Codex implements assigned work. The loop
normally stops whenever the queue momentarily empties or a tick ends, and a human restarts
it. codex-loop closes that gap, in **whatever repo you invoke it from** — it hardcodes no
project.

## Objective

> Have Claude control the work that goes to Codex via GitHub issues (state + tracking), and
> eliminate manual restarts.

1. **Issue-driven control.** Every unit of work is a GitHub issue. Its labels + a small
   comment grammar (`LOOP:*` markers) *are* the state machine. Nothing lives in Claude's head
   between ticks; state survives restarts because it lives in GitHub.
2. **No manual restarts.** The orchestrator paces itself (poll tight while work is in flight,
   back off when idle, halt when drained or paused) instead of running one tick and waiting.

## Repo-agnostic by design

The skill hardcodes **nothing** about any project. On first use in a repo it:

1. **Auto-detects** whether the loop is set up (looks for a `codex-loop:control` issue + the
   label set).
2. If not, **prompts to scaffold** it — creates the labels and a pinned **Control Tower
   issue** seeded with a config block, after you confirm.
3. Reads all project-specific parameters (deploy command, CI command, priority order, worker
   mode) from that Control Tower config block — so the same global skill drives any repo.

## Two ways to hand work to Codex

| Surface | What it is | Latency | Where |
|---|---|---|---|
| **Cloud Codex** | ChatGPT cloud picks up `agent:codex loop:ready` issues, returns `codex/*` PRs | async (idle gap) | fire-and-forget |
| **Local Codex** | the `codex` plugin's `codex:codex-rescue` subagent → local `codex app-server` | synchronous, in-session | your machine |

The **idle gap** — Codex finishing a PR then having nothing to do until the next tick — is
what the synchronous local path removes: Claude feeds Codex the next issue the instant the
last one lands. Choose per repo (or per issue, in hybrid mode) via the `worker` config.

## Install (global personal skill)

```bash
mkdir -p "$HOME/.claude/skills"
ln -sfn "$HOME/Code/codex-loop/skills/codex-loop" "$HOME/.claude/skills/codex-loop"
```

`/codex-loop` is now invocable from any repo. See [docs/INSTALL.md](docs/INSTALL.md).

## Layout

```
codex-loop/
├── README.md
├── docs/
│   ├── DESIGN.md            ← stall points, detect→scaffold→iterate→pace, guardrails
│   ├── ISSUE-PROTOCOL.md    ← labels + LOOP:* grammar + Control Tower config = the state machine
│   ├── INSTALL.md           ← global install, first-run scaffolding, running the loop
│   └── ROADMAP.md           ← phased plan
└── skills/codex-loop/SKILL.md   ← the invocable /codex-loop orchestrator
```

## Reference target

Built for, and validated against, the two-agent loop on `Bostonvex/auspicia` (Claude =
frontend + orchestration, Codex = backend). That repo is the reference deployment, not a
dependency — the skill itself contains no auspicia-specific code.
