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
Freeze the handoff (Claude, in the issue body — see "Handoff as audit log" below):
  <!-- LOOP:CONTRACT issue=NN -->

Assign (Claude → Codex):
  <!-- LOOP:ASSIGN agent=codex issue=NN contract=frozen -->

Codex status (Claude READS these; cloud Codex writes them):
  <!-- LOOP:STATUS agent=codex issue=NN state=… pr=### ci=… -->     state ∈ {started,pr-open,blocked,failed}

Handback receipt (Claude, on every return — local clean-exit or cloud PR verify):
  <!-- LOOP:HANDBACK issue=NN worker=local|cloud files=N scope=clean|violation verify=pass|fail -->

Escalation reason (Claude, on stall/deadline/verify-fail/scope-violation/direction-change):
  <!-- LOOP:FALLBACK issue=NN reason=stall|deadline|verify-fail|scope-violation|direction-change action=claude|park -->

Claude verdict on a Codex PR:
  <!-- LOOP:VERIFY issue=NN pr=### verdict=pass|bounce -->
```

Six-heading prose (follows every marker):
`Current State / Changed / Verification / Deployment / Risks-Unknowns / Next Recommended Step`

## Handoff as audit log

The issue is not just a queue item — it carries enough of the **handoff contract** to debug a bad
outcome later. Two structured blocks turn "why did the loop make a bad merge?" into a clean triage
— *underspecified* vs *scope violation* vs *wrong verification* — readable from the issue alone.

**`LOOP:CONTRACT`** — frozen by Claude *before* assign, in the issue body:

```
<!-- LOOP:CONTRACT issue=NN -->
### Frozen contract
- **Interface:** types / API shape / migration id — the frozen surface
- **In scope:** files/areas Codex may change
- **Out of scope — do NOT touch:** paths/globs that must stay untouched
- **Acceptance criteria:** checkable bullets (the verifier judges against these)
- **Verify:** the exact command(s) to run before handback
- **Context loaded:** the files/docs/commits Claude actually read to freeze this
- **Assumptions (unverified):** things taken as true but not checked
```

**`LOOP:HANDBACK`** — posted by Claude on every return (local clean-exit or cloud PR verify):

```
<!-- LOOP:HANDBACK issue=NN worker=local|cloud files=<n> scope=clean|violation verify=pass|fail -->
### Handback receipt
- **Changed files** (`git diff --name-only`): the actual diff, not prose
- **Scope check:** changed ∩ out-of-scope = none → clean · else → violation (forces a bounce)
- **Tests — claimed (Codex, from `-o` result / PR body):** … · **actually run (Claude):** cmd + result
- **Contract adherence:** met, or the specific deviations
```

**Audit invariant:** no `agent:codex` issue merges/closes without the full chain
`LOOP:CONTRACT → LOOP:ASSIGN → LOOP:HANDBACK → LOOP:VERIFY`; a merge over a `scope=violation`
handback is a guardrail breach. Backward-compatible — an issue with no `LOOP:CONTRACT` still runs
(the scope check is an advisory no-op), but freezing one is required for `agent:codex` work.

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
 loop:blocked ─(predecessor merged)─▶ loop:ready ─(freeze LOOP:CONTRACT)─▶ LOOP:ASSIGN contract=frozen
                                                                                   │
                                      ┌── cloud ──▶ LOOP:STATUS state=pr-open ──┐  │
                                      └── local ──▶ worktree diff ──────────────┤◀─┘
                                                                                 ▼
                          Claude: scope-check + verify (CI + plan + diff) ─▶ LOOP:HANDBACK receipt
                                             ┌── pass (green & scope clean) ─┐   ┌──── fail ────┐
                                             ▼                               │   ▼              │
                                  merge + LOOP:VERIFY pass                   │  LOOP:VERIFY bounce (relabel loop:ready)
                                  close; unblock successor                   │  scope-violation → LOOP:FALLBACK
                                                                             │  2× bounce → needs:human
```

## Why this survives restarts

Because status is labels, transitions are comments, and config is the Control Tower body, a
brand-new Claude session in the repo can: read the Control Tower (paused? config?), list
issues by label (the queue), read each item's newest `LOOP:*` marker (its stage) — and resume
mid-flight with zero handoff. No in-memory loop state to lose. That is the property that lets
the cadence layer stop/start freely, and lets the same skill drive any repo.
