# Issue protocol — GitHub issues as the state machine

codex-loop keeps **no state in Claude's head between ticks**. The complete state of the
loop lives in GitHub: issue **labels** are the status, and a small **comment grammar**
records transitions and decisions. This is what makes restarts safe — a fresh session
reconstructs everything by reading issues.

## Roles

- **Claude (orchestrator).** Opens/assigns/verifies/merges/deploys. Sole merger + deployer.
  Does all frontend directly.
- **Codex (worker).** Implements assigned backend only. Returns `codex/*` PRs (cloud) or a
  worktree diff (local). Never merges or deploys.

## Labels = status

| Label | Meaning |
|---|---|
| `agent:codex` | this issue's work belongs to Codex (backend) |
| `agent:claude` | this issue's work belongs to Claude (frontend) |
| `loop:ready` | actionable now; eligible to be picked up this tick |
| `loop:blocked` | gated on a predecessor; not yet actionable |
| `backend` | backend work (paired with `agent:codex`) |
| `needs:human` | **parked** — the loop must not act; a human decides |
| `worker:local` / `worker:cloud` | *(optional, hybrid mode)* which Codex surface handles it |

A backend issue moves `loop:blocked` → `loop:ready` → (assigned) → (pr-open) → (verified,
closed). A parked issue gets `needs:human` and is skipped until a human clears it.

## Comment grammar

Every loop comment begins with an HTML-comment marker (machine-readable), followed by the
six-heading prose block (human-readable).

### Markers

```
Assign (Claude → Codex):
  <!-- LOOP:ASSIGN agent=codex issue=NN contract=frozen -->

Codex status (Claude READS these; cloud Codex writes them):
  <!-- LOOP:STATUS agent=codex issue=NN state=… pr=### ci=… -->
    state ∈ { started, pr-open, blocked, failed }

Claude verdict on a Codex PR:
  <!-- LOOP:VERIFY issue=NN pr=### verdict=pass|bounce -->

Loop-wide control (on the Control Tower issue body):
  LOOP:STATE=PAUSE | RUN      ← first token wins; PAUSE halts the loop
```

### Six-heading prose (follows every marker)

```
Current State / Changed / Verification / Deployment / Risks-Unknowns / Next Recommended Step
```

## The Control Tower issue (#175)

One pinned issue is the loop's dashboard and control surface:

- **Control:** the first `LOOP:STATE=` token in its body is the kill switch. `PAUSE` = the
  engine no-ops and halts every iteration until it reads `RUN` (or the token is removed).
- **Tick log:** each iteration appends a comment — queue counts (ready/blocked/parked per
  agent), what was assigned/verified/merged/deployed, blockers, anything newly parked.
- **Drain signal:** when both queues are empty the engine posts "queue drained" and idles.

## State transitions (backend issue lifecycle)

```
 loop:blocked ──(predecessor merged)──▶ loop:ready
      │                                     │
      │                             (contract frozen)
      │                                     ▼
      │                        LOOP:ASSIGN contract=frozen
      │                                     │
      │                    ┌── cloud ──▶ LOOP:STATUS state=pr-open ──┐
      │                    │                                          │
      │                    └── local ──▶ worktree diff ──────────────┤
      │                                                               ▼
      │                                              Claude verify: CI + plan + diff
      │                                         ┌───── pass ─────┐  ┌─ bounce ─┐
      │                                         ▼                │  ▼          │
      │                              merge + LOOP:VERIFY pass    │  LOOP:VERIFY bounce
      │                              close; unblock successor    │  (relabel loop:ready)
      ▼                                                          │  2× bounce → needs:human
 (successor becomes loop:ready) ◀──────────────────────────────┘
```

## Why this survives restarts

Because status is labels and transitions are comments, a brand-new Claude session can:

1. read the Control Tower issue → know if it's paused,
2. list issues by label → know the exact queue,
3. read each issue's newest `LOOP:*` marker → know what stage every item is at,

…and resume mid-flight with zero handoff. There is no in-memory loop state to lose. This is
the property that lets the cadence layer stop/start freely without a human re-briefing it.
