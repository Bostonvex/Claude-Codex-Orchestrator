# Issue protocol — GitHub issues as the state machine

codex-loop keeps **no state in the model's head between ticks**. The complete state of the
loop lives in GitHub: issue **labels** are the status, a small **comment grammar** records
transitions, and a **config block** on the Control Tower issue holds every project-specific
parameter. This is what makes restarts safe and the skill repo-agnostic — a fresh session in
any repo reconstructs everything by reading issues.

## Roles

- **Claude (orchestrator).** Opens/assigns/verifies/merges/deploys. Sole merger + deployer.
  Implements `agent:claude` issues directly.
- **Codex (worker).** Implements assigned `agent:codex` issues only. Returns a `codex/*` PR
  (cloud) or a worktree diff (local). Never merges or deploys.

## Labels = status

| Label | Meaning |
|---|---|
| `codex-loop:control` | marks the single Control Tower issue (holds config + is the dashboard) |
| `agent:codex` | this issue's work belongs to Codex |
| `agent:claude` | this issue's work belongs to Claude |
| `loop:ready` | actionable now; eligible this tick |
| `loop:blocked` | gated on a predecessor; not yet actionable |
| `needs:human` | **parked** — the loop must not act; a human decides |
| `worker:local` / `worker:cloud` | *(hybrid mode only)* which Codex surface handles it |
| `role:<persona>` | *(optional, on-demand)* route to a specialist persona (e.g. `role:devops`, `role:docs`, `role:deps`, `role:architect`) — see [PERSONAS.md](PERSONAS.md) |

These labels are intrinsic to codex-loop, not to any project. The skill creates them on
first run (Phase B) if they're missing.

## Comment grammar

Every loop comment begins with an HTML-comment marker (machine-readable), followed by the
six-heading prose block (human-readable).

```
Assign (Claude → Codex):
  <!-- LOOP:ASSIGN agent=codex issue=NN contract=frozen -->

Codex status (Claude READS these; cloud Codex writes them):
  <!-- LOOP:STATUS agent=codex issue=NN state=… pr=### ci=… -->     state ∈ {started,pr-open,blocked,failed}

Claude verdict on a Codex PR:
  <!-- LOOP:VERIFY issue=NN pr=### verdict=pass|bounce -->
```

Six-heading prose (follows every marker):
`Current State / Changed / Verification / Deployment / Risks-Unknowns / Next Recommended Step`

## The Control Tower issue

One issue, labeled `codex-loop:control` and pinned, is the loop's dashboard, kill switch,
and **config store**. Its body carries a config block:

```
<!-- CODEX-LOOP:CONFIG
state=RUN            # RUN | PAUSE — the kill switch (first token wins)
worker=local         # local | cloud | hybrid  (default: local)
deploy=              # shell command to deploy; empty = never deploy
verify=              # CI/verification command(s); empty = auto-detect
priority=number      # "number" (issue # asc) or comma-separated backlog file paths
mode=sequential      # sequential | wave  (see ORCHESTRATION.md)
concurrency=1        # max issues implemented at once in wave mode
gates=verify         # verify,lint,typecheck,review,cleanup — gates before merge
trailer=Co-Authored-By: Claude <noreply@anthropic.com>
-->
```

- **Control:** `state=PAUSE` halts the loop every iteration until it reads `RUN`.
- **Config:** everything project-specific lives here — so the skill itself hardcodes nothing.
- **Tick log:** each iteration appends a comment (queue counts, assigned/verified/merged/
  deployed, blockers, newly parked).
- **Drain signal:** when both queues are empty the engine posts "queue drained" and idles.

## Backend issue lifecycle

```
 loop:blocked ──(predecessor merged)──▶ loop:ready ──(contract frozen)──▶ LOOP:ASSIGN contract=frozen
                                                                                   │
                                      ┌── cloud ──▶ LOOP:STATUS state=pr-open ──┐  │
                                      └── local ──▶ worktree diff ──────────────┤◀─┘
                                                                                 ▼
                                                    Claude verify: CI + plan + diff
                                             ┌──── pass ────┐        ┌──── bounce ────┐
                                             ▼              │        ▼                │
                                  merge + LOOP:VERIFY pass  │   LOOP:VERIFY bounce (relabel loop:ready)
                                  close; unblock successor  │   2× bounce → needs:human
```

## Why this survives restarts

Because status is labels, transitions are comments, and config is the Control Tower body, a
brand-new Claude session in the repo can: read the Control Tower (paused? config?), list
issues by label (the queue), read each item's newest `LOOP:*` marker (its stage) — and resume
mid-flight with zero handoff. No in-memory loop state to lose. That is the property that lets
the cadence layer stop/start freely, and lets the same skill drive any repo.
