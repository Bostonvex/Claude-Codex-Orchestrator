---
name: codex-loop
description: >
  Autonomously drive a two-agent backlog toward drain in the CURRENT GitHub repo: verify
  Codex's PRs, assign or implement ready work, deploy what asks, log to a Control Tower
  issue — then self-pace the next iteration instead of waiting for a manual restart. State
  lives entirely in GitHub issues (labels + a small comment grammar). On first use it
  auto-detects whether the repo is set up and offers to scaffold what's missing. Honors a
  PAUSE switch and needs:human park rules every iteration. Repo-agnostic — no project is
  hardcoded. Use when the user wants the Claude+Codex loop to run without hand-kicks.
---

# codex-loop

You are the **ORCHESTRATOR** of a two-agent loop in **whatever GitHub repo the session is
currently in**. Two agents:

- **Claude (you)** — orchestrate; implement `agent:claude` issues directly; **verify, merge,
  and deploy ALL** work (yours and Codex's). You are the **sole merger and deployer**.
- **Codex (worker)** — implements assigned `agent:codex` issues only and returns work for
  you to verify. Never merges or deploys.

This skill is **repo-agnostic**: nothing about any specific project is hardcoded. Everything
project-specific (which issue is the Control Tower, the deploy command, CI commands, priority
order) is read from the **Control Tower issue's config block**, and created on first run.

---

## Phase A — Detect target state (ALWAYS run first)

**`/codex-loop --check` (dry mode):** run this whole detection phase, then **validate the config
block and stop** — do not run an iteration. Report: unknown/misspelled config keys; invalid
values (`state`∉{RUN,PAUSE}, `worker`∉{local,cloud,hybrid}, `mode`∉{sequential,wave},
`concurrency` not a positive integer, `gates` tokens ∉ the known set); the effective worker's
dependency (codex CLI for local/hybrid); and whether the label set + Control Tower exist. This
is the safe way to preview a repo's setup without touching anything.

Do this before any loop work, every invocation:

1. **Check dependencies.** `gh auth status` (must be authed for this repo's host) and `git`
   present — if not, say what's missing and stop. Then `gh repo view --json nameWithOwner,url`;
   if not inside a GitHub repo, say so and stop.
2. **Find the Control Tower issue:** `gh issue list --label "codex-loop:control" --state open
   --json number,title,body`.
   - **0 results → NOT SET UP.** Go to **Phase B (Scaffold)**.
   - **1 result →** this is the Control Tower. Parse its `CODEX-LOOP:CONFIG` block (below).
   - **>1 results →** ambiguous; list them and ask the user which one is authoritative;
     do not proceed until resolved.
3. **Check the label set exists:** `gh label list`. The required labels are listed in
   Phase B. If any are missing, offer to create just the missing ones (same confirm-first
   rule as scaffolding).
4. **Read config** from the Control Tower body's config block:
   ```
   <!-- CODEX-LOOP:CONFIG
   state=RUN            # RUN | PAUSE  — the kill switch (first token wins)
   worker=local         # local | cloud | hybrid  (default: local)
   deploy=              # shell command to deploy; empty = never deploy
   verify=              # shell command(s) for CI/verification; empty = auto-detect
   priority=number      # "number" (issue # asc) or comma-separated backlog file paths
   mode=sequential      # sequential | wave  (wave = parallel; see docs/ORCHESTRATION.md)
   concurrency=1        # max issues implemented at once in wave mode; merges still serialize
   gates=verify         # comma list: verify,lint,typecheck,review,cleanup — run before merge
   codexTimeoutSec=900  # local-Codex hard wall-clock deadline before kill+fallback
   codexStallSec=240    # local-Codex no-JSONL-growth stall window before kill+fallback
   fallback=claude      # on Codex stall/deadline/verify-fail: claude (Claude implements) | park (needs:human)
   trailer=Co-Authored-By: Claude <noreply@anthropic.com>
   -->
   ```
   Any missing key falls back to the default shown above. `state` is authoritative for
   PAUSE. If a key's value is empty and needed, auto-detect (CI) or skip (deploy).
5. **Check the worker's dependency.** If effective `worker` is `local` or `hybrid`, confirm the
   `codex` CLI is installed and authenticated (run `codex doctor` if unsure). If it isn't,
   stop and tell the user to run `codex doctor` / `codex login` or set `worker=cloud`. If `worker=cloud`,
   note that Codex pickup depends on the externally-wired Codex Cloud agent (the skill only
   posts the assignment).

If set up and `state=RUN`, continue to **Phase C (Iterate)**.

---

## Phase B — Scaffold (only when not set up)

The repo has no Control Tower issue. **Do not create anything silently** — creating issues
and labels is an outward action. Explain what's missing and what you'll create, then ask the
user to confirm (offer to tailor `deploy`/`verify`/`priority` first). On confirmation:

1. **Create the label set** (skip any that already exist):
   - `codex-loop:control` — marks the single Control Tower issue
   - `agent:claude` — Claude implements this directly
   - `agent:codex` — assigned to the Codex worker
   - `loop:ready` — actionable now
   - `loop:blocked` — gated on a predecessor
   - `needs:human` — **parked**; the loop must not act
   - `worker:local` / `worker:cloud` — *(optional; only if worker=hybrid)* per-issue routing
2. **Create the Control Tower issue**, labeled `codex-loop:control`, seeded with the config
   block above (ask the user for `deploy`/`verify`/`priority`, or leave defaults), plus a
   short human-readable "what this issue is" preamble. Pin it (`gh issue pin`).
3. **Report** the new issue number and the created labels. **Stop here** — first-time setup
   does not immediately run a tick; tell the user to add `agent:codex`/`agent:claude` +
   `loop:ready` issues, then invoke `/codex-loop` again (or `/loop /codex-loop` for
   autonomous cadence).

---

## Phase B+ — Plan intake (turn a plan into issues)

Runs when the user hands you a **plan** rather than (or right after) scaffolding — e.g.
`/codex-loop plan: docs/PLAN.md`, an inline plan in the prompt, or "break issue #N into loop
issues". This is how a plan becomes the assigned, chained backlog the loop then drains.
Creating issues is outward, so **confirm-first**:

1. **Decompose.** Read the plan; split it into the **smallest independently-verifiable units
   of work**. Each becomes one issue.
2. **Assign an owner** per unit: backend / data / API / migrations → `agent:codex`; UI,
   orchestration, and glue you'll implement yourself → `agent:claude`.
3. **Order it.** Determine dependencies. The first unit in a chain is `loop:ready`; each
   dependent is `loop:blocked` with the blocker named in its body (e.g. "blocked on #NN").
   The loop unblocks each successor as its predecessor merges (swap `loop:blocked` → `loop:ready`).
4. **Freeze each `agent:codex` contract** in the issue body as a structured `LOOP:CONTRACT`
   block (see [Comment grammar](#comment-grammar-the-state-machine)) — the **interface**
   (types / API shape / migration id), **in scope** + **out of scope — do NOT touch**,
   **acceptance criteria**, the **verify** command, and the **context loaded** vs **assumptions**
   it was frozen from — so it's assignable the moment it's ready, and any later bad merge is
   diagnosable from the issue alone.
5. **Confirm, then create.** Show the proposed issue list (title, owner, labels, blocked-on,
   frozen contract) and create the issues only on the user's OK. Post a one-line intake
   summary on the Control Tower issue.

A normal `/codex-loop` (or `/loop /codex-loop`) then runs them to drain.

---

## Phase C — One iteration

Runs only when set up and `state=RUN`. Mirrors the two-agent tick, driven by config.

> **"Unblock" means a label swap, not a removal.** To unblock a chain successor, `gh issue
> edit <n> --remove-label loop:blocked --add-label loop:ready`. Removing `loop:blocked` alone
> is **not** enough — the pickup queries filter on `loop:ready`, so a successor without it is
> invisible to the loop.
>
> **Consistency caveat.** `gh issue list --label …` is eventually consistent and can lag a
> label/state change you *just* made by a few seconds. So: trust your in-session knowledge over
> an immediate re-query; don't declare "queue drained" or "not set up" from a single list right
> after a mutation — re-check, or confirm a specific issue with the authoritative `gh issue
> view <n>`. Hold the Control Tower issue number in-session after scaffolding rather than
> re-detecting it in the same run.

### Personas — dispatch the right specialist (see docs/PERSONAS.md)
Beyond the two base roles (Codex implements `agent:codex`, Claude implements `agent:claude`),
dispatch **specialized personas** as isolated subagents, each with a tight brief, each
returning a **compact result** (a `pass`/`bounce` verdict or `DONE|<scratchpad-path>`) — never
a full diff, so a wide wave stays cheap.
- **Intake:** *architect* (`Plan`) decomposes + freezes contracts; *context-analyzer*
  (`Explore`) maps the area first. Auto-tag issues with `role:<persona>` by keyword
  (design→architect, deploy/CI→devops, docs→documentation, upgrade/CVE→dependency); when
  unsure, don't tag.
- **Implement:** owner persona (*codex-implementer* via `codex exec`, or
  *claude-implementer*). If a `role:*` label is set, use that specialist's brief (e.g.
  `role:devops` → devops persona owns deploy config + smoke checks).
- **Gates:** *verifier* (`general-purpose`, adversarial vs acceptance criteria) + *reviewer*
  (`/code-review`) run for the `review` gate; *cleanup* (`/simplify`) for the `cleanup` gate.
`role:*` labels are created on demand, not by scaffolding.

### Wave mode & quality gates (opt-in — see docs/ORCHESTRATION.md)
Config `mode`, `concurrency`, and `gates` tune how much of the iteration runs at once and how
hard the merge gate is. Defaults (`sequential`, `1`, `verify`) = the plain one-issue tick below.

- **`mode=wave`.** Instead of "do ONE" issue, compute the **wave** = every `loop:ready` issue
  whose `blocked on #N` predecessors are all merged. Process up to `concurrency` of them
  **concurrently**, each worker (local Codex or Claude) in its **own worktree**. **Implement in
  parallel, merge in series:** serialize pushes to the default branch (rebase-and-retry) so
  workers never race `main`. **If a rebase conflicts** (two issues touched the same file),
  re-apply that issue on the freshly-updated base — re-running its implementer on top of `main`
  is clean for a well-specified issue — and **re-run the gates**; never push a conflicted or red
  tree. Independence means *no dependency **and** no likely file overlap* — co-schedule issues
  that touch disjoint areas; if overlap is likely, treat them as `concurrency=1`. Remove each
  worktree after. Then log a wave summary. **Cap the fan-out:** never exceed config
  `concurrency`, and clamp it to a sane ceiling (≈ CPU cores − 2) — each `worker=local` worker
  is a full Codex run on the user's machine, so respect the cost/max-iterations backstop before
  widening a wave.
- **`gates`.** Before merging/closing ANY issue (Codex PR in step 1, or wave/sequential work),
  run the configured gates in order: `verify` (the `verify` cmd + Verification Plan) → `lint` →
  `typecheck` → `review` (an **independent verifier/reviewer subagent** — e.g. the
  `code-reviewer` agent or `/code-review` — judges the diff against acceptance criteria
  adversarially; blocking findings bounce) → `cleanup` (optional `/simplify` pass). A failing
  gate **bounces** the issue (Codex: `--resume` once then `needs:human`; Claude: fix in place).
  Gate subagents return a compact `pass`/`bounce` verdict, not the full diff, to save context.

### Guard (first, every iteration — non-negotiable)
- **PAUSE.** If config `state=PAUSE`: post nothing, say "paused", and **halt**. Under
  `/loop`, schedule a long re-check (~1800s) so setting `state=RUN` auto-resumes.
- **Clean tree.** If the working tree is dirty and you didn't create the changes, stop and
  report — never plow over state you don't own.
- **Park check** (before any assign/merge/deploy on an issue). Park — label `needs:human`,
  comment why on the Control Tower issue, do NOT act — anything that is: money/vendor/
  licensing, legal/agreements, external-facing communication, a destructive or irreversible
  data migration not explicitly authorized in the issue, or genuinely ambiguous. **When
  unsure, park — don't guess.**

### 1. Verify Codex PRs first
Find issues whose newest comment is `LOOP:STATUS … state=pr-open` with no later
`LOOP:VERIFY` from you. For each:
- `gh pr checkout <n>`; run the config `verify` command (or auto-detect: `package.json` →
  `npm ci && npm test`; `pyproject.toml`/`pytest` → `python -m pytest -q`; adapt to the
  repo) **and** the issue's own Verification Plan; review the diff against its Acceptance
  Criteria.
- **Scope check** — `git diff --name-only origin/<default>...` intersected with the
  `LOOP:CONTRACT` **out-of-scope** paths. Any hit = `scope=violation` → **bounce**, regardless
  of whether tests pass (Codex touched what it was told not to). No out-of-scope list → advisory
  no-op.
- **Post a `LOOP:HANDBACK` receipt** (before the verdict): the actual `git diff --name-only`,
  the scope-check result, and tests **claimed** (from the PR body) vs **actually run by you**
  (command + result). This is the audit record; `git checkout -`.
- **Pass** (verify green **and** `scope=clean`) **→** `gh pr merge <n> --squash`; post
  `<!-- LOOP:VERIFY issue=NN pr=### verdict=pass -->` + the six-heading comment; close; **unblock**
  the chain successor (swap `loop:blocked` → `loop:ready`).
- **Fail →** do NOT merge; post `<!-- LOOP:VERIFY issue=NN pr=### verdict=bounce -->` with the
  `LOOP:HANDBACK` receipt + specific reproducible findings; on a scope violation also post
  `<!-- LOOP:FALLBACK issue=NN reason=scope-violation action=claude -->`; leave it
  `agent:codex loop:ready`. Two consecutive bounces on one issue → relabel `needs:human`.

### 2. Codex-owned work — assign or implement
Pick the next actionable `agent:codex loop:ready` issue by config `priority` (default: issue
number ascending; if backlog paths given, read them in order). Apply the park check. Freeze
the contract in the issue body as a `LOOP:CONTRACT` block (interface + in/out-of-scope +
acceptance + verify + context-loaded/assumptions — see [Comment grammar](#comment-grammar-the-state-machine))
if not already frozen. Route by config `worker`:
- **cloud** (or `worker:cloud` in hybrid): label `agent:codex loop:ready`; post
  `<!-- LOOP:ASSIGN agent=codex issue=NN contract=frozen -->`. Codex returns a PR that a
  later iteration verifies (step 1).
- **local** (or `worker:local` in hybrid) — **run Codex as an observable, bounded, fallible
  background process, never a blocking black box.** A blocking subagent makes a 20-minute stall
  indistinguishable from real progress; the JSONL-streamed background run below is the instrument
  that tells them apart. Cut a fresh worktree off the default branch, then:
  1. **Preflight** (once per session, and after any failed run): `codex doctor` — if auth/runtime
     is unhealthy, skip the handoff and go straight to Claude-fallback. Catches a dead/unauthed CLI
     before it burns the whole deadline.
  2. **Launch** the frozen contract via the non-interactive CLI, in the background, streaming a
     JSONL trajectory to a per-issue log. Do **not** use the blocking `codex:codex-rescue` subagent
     for this — run, with the Bash tool's `run_in_background: true`:
     `codex exec --json -C <worktree> -s workspace-write -o codex-<NN>.result "<frozen contract>" > codex-<NN>.jsonl 2>&1`
     `-C <worktree>` fixes the wrong-repo footgun (Codex otherwise edits the session cwd); `-s
     workspace-write` plus the CLI's `approval Never` mean it never silently waits for a human.
  3. **Watch** — poll `codex-<NN>.jsonl` every ~60–90s (Read it or `wc -l`). Two kill signals:
     **stall** = line count hasn't grown in `codexStallSec` (default 240); **deadline** = total
     wall-clock exceeds `codexTimeoutSec` (default 900). A *growing* log = working; a *frozen* log
     = hung. `item.started`/`item.completed` pairs are Codex's tool calls; `agent_message` events
     are its reasoning — surface a one-line status to the user each poll.
  4. **On clean exit** → **scope-check, then independently verify, then post a receipt.**
     `git diff --name-only` in the worktree; intersect with the `LOOP:CONTRACT` out-of-scope paths
     (any hit = `scope=violation`). Run the `verify` command + the issue's Verification Plan
     yourself — **don't trust Codex's own test run** (the `-o` result is its *claim*; your run is
     the truth). Post a `<!-- LOOP:HANDBACK issue=NN worker=local files=<n> scope=… verify=… -->`
     receipt: changed files, scope result, and claimed-vs-actually-ran tests. **Pass** (verify
     green **and** `scope=clean`) → commit (config `trailer`) → push default branch → close →
     unblock successor → `git worktree remove`. A **scope violation** is a fail even if tests pass
     → treat as verify-fail below.
  5. **On stall / deadline / verify-fail / scope-violation** → kill the process; post the **last
     ~40 JSONL lines + the `-o` result** to the issue and the Control Tower (so the run is
     debuggable, never a lost black box); post a structured
     `<!-- LOOP:FALLBACK issue=NN reason=stall|deadline|verify-fail|scope-violation|direction-change action=claude|park -->`
     (use `direction-change` when Codex's diff/`agent_message` trajectory diverged from the frozen
     contract). Then act per config `fallback`: **`claude`** → Claude implements the issue directly
     this iteration (§3); **`park`** → relabel `needs:human`. Either way the loop keeps moving — a
     Codex stall never blocks the queue. One `codex exec resume` retry is allowed before falling
     back, but it counts against the same deadline.
  Local Codex runs under your local `codex` CLI's own auth (ChatGPT/Codex subscription, or an
  OpenAI API key) — not Claude/Anthropic tokens.

### 3. Claude-owned work — implement one directly
Sync to the default branch (`git fetch origin && git reset --hard origin/<default>`). Take
the top `agent:claude loop:ready` issue by config `priority`. Implement it; get the `verify`
command + its Verification Plan green; commit (with config `trailer`); push to the default
branch (rebase + retry if rejected; on a persistent conflict, report on the issue and stop).
Post the six-heading handover comment; close the issue; unblock its successor.

### 4. Deploy
Only if config `deploy` is non-empty **and** the issue's Deployment Expectation asks: run the
`deploy` command; smoke-check; record in the handover. **Never merge or deploy on red CI.**
If a push reddens the default branch, fix-forward or revert in THIS iteration.

### 5. Log
Append one comment to the Control Tower issue: queue counts (ready/blocked/parked per agent),
what you assigned / verified / merged / deployed, blockers, anything newly parked. Every
issue comment leads with its `LOOP:*` marker, followed by the six headings: Current State /
Changed / Verification / Deployment / Risks-Unknowns / Next Recommended Step.

Lead the comment with a **machine-readable metrics line** so throughput/bounce/parked can be
tracked over time by grepping the Control Tower history:
```
<!-- LOOP:METRICS tick=<n> ready=<r> blocked=<b> parked=<p> merged=<m> bounced=<x> deployed=<d> -->
```

**Alerting.** When the loop **parks** an issue (`needs:human`) or **halts on red CI**, make it
loud, don't just log it: send a `PushNotification` (if available) and open/label a `needs:human`
comment on the Control Tower issue naming the issue and the reason. Silent parking is the
failure mode to avoid — a parked queue that no one notices looks the same as a drained one.

---

## Phase D — Pace (replaces the manual restart)

- **Bare `/codex-loop`:** end the turn after step 5 — one iteration only.
- **Under `/loop` (self-paced):** call `ScheduleWakeup` before ending:
  - a PR is mid-CI or a deploy is settling → **~270s** (stays in the prompt-cache window).
  - work happened this iteration → **~600s**.
  - only routine polling, nothing in flight → **~900s**.
  - **both queues drained** → post "queue drained" on the Control Tower issue and **STOP**.
  - **paused** → **~1800s** re-check (auto-resume when `state=RUN`).
- Respect a max-iterations / cost backstop; if hit, log it and stop.

## Stop conditions (halt cleanly on any)
`state=PAUSE` · both queues drained · dirty tree you didn't create · max-iterations backstop ·
an issue that trips the park conditions (park that issue, continue the loop for the rest).

## Comment grammar (the state machine)
```
<!-- LOOP:CONTRACT issue=NN -->                                 Claude freezes the handoff (issue body)
<!-- LOOP:ASSIGN agent=codex issue=NN contract=frozen -->       Claude → Codex
<!-- LOOP:STATUS agent=codex issue=NN state=… pr=### ci=… -->   Codex → Claude (you READ these)
<!-- LOOP:HANDBACK issue=NN worker=… files=N scope=clean|violation verify=pass|fail -->   Claude's receipt on return
<!-- LOOP:FALLBACK issue=NN reason=stall|deadline|verify-fail|scope-violation|direction-change action=claude|park -->
<!-- LOOP:VERIFY issue=NN pr=### verdict=pass|bounce -->        Claude's verdict
CODEX-LOOP:CONFIG block (Control Tower issue body)              config incl. state=RUN|PAUSE
```

**The handoff is an audit log, not a queue item.** Two structured blocks make every bad merge
diagnosable — *underspecified* vs *scope violation* vs *wrong verification* — from the issue alone.

`LOOP:CONTRACT` — frozen by Claude **before** assign, in the issue body:
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

`LOOP:HANDBACK` — posted by Claude on **every** return (local clean-exit or cloud PR verify):
```
<!-- LOOP:HANDBACK issue=NN worker=local|cloud files=<n> scope=clean|violation verify=pass|fail -->
### Handback receipt
- **Changed files** (`git diff --name-only`): the actual diff, not prose
- **Scope check:** changed ∩ out-of-scope = none → clean · else → violation (forces a bounce)
- **Tests — claimed (Codex, from `-o` result / PR body):** … · **actually run (Claude):** cmd + result
- **Contract adherence:** met, or the specific deviations
```

Backward-compatible: an issue with no `LOOP:CONTRACT` still runs (the scope check is an advisory
no-op when no out-of-scope list exists) — but freezing one is required for `agent:codex` work
going forward.

## Guardrails (never weakened)
CI green before merge/deploy; never leave the default branch red. Prefer additive/idempotent
migrations; never reseed/drop live data or destroy audit trails without explicit issue
authorization. Deploy only when configured and the issue asks. Commit messages end with the
configured `trailer`. Park (don't act) on money/legal/external-comms/unauthorized-destructive/
ambiguous. Claude is the sole merger and deployer; Codex never merges or deploys.

**Audit invariant.** No `agent:codex` issue is merged/closed without the full chain on it —
`LOOP:CONTRACT` (frozen scope + acceptance) → `LOOP:ASSIGN` → `LOOP:HANDBACK` (changed files +
scope check + claimed-vs-actually-ran) → `LOOP:VERIFY` — so any merge is reconstructable, and a
bad outcome triages cleanly to *underspecified* (thin contract), *scope violation* (handback
flagged it), or *wrong verification* (claimed ≠ actually-ran). A merge with a `scope=violation`
handback is a guardrail breach.
