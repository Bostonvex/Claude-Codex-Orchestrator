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
   trailer=Co-Authored-By: Claude <noreply@anthropic.com>
   -->
   ```
   Any missing key falls back to the default shown above. `state` is authoritative for
   PAUSE. If a key's value is empty and needed, auto-detect (CI) or skip (deploy).
5. **Check the worker's dependency.** If effective `worker` is `local` or `hybrid`, confirm the
   `codex` CLI is installed and authenticated (run `/codex:setup` if unsure). If it isn't,
   stop and tell the user to run `/codex:setup` or set `worker=cloud`. If `worker=cloud`,
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
4. **Freeze each `agent:codex` contract** in the issue body — pin types, API shape, migration
   id, and acceptance criteria — so it is assignable the moment it becomes ready.
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
  Criteria; `git checkout -`.
- **Pass →** `gh pr merge <n> --squash`; post `<!-- LOOP:VERIFY issue=NN pr=### verdict=pass -->`
  + the six-heading comment; close the issue; **unblock** its chain successor (swap
  `loop:blocked` → `loop:ready`).
- **Fail →** do NOT merge; post `<!-- LOOP:VERIFY issue=NN pr=### verdict=bounce -->` with
  specific reproducible findings; leave it `agent:codex loop:ready`. Two consecutive bounces
  on one issue → relabel `needs:human`.

### 2. Codex-owned work — assign or implement
Pick the next actionable `agent:codex loop:ready` issue by config `priority` (default: issue
number ascending; if backlog paths given, read them in order). Apply the park check. Freeze
the contract in the issue body (pin types / API shape / migration id) if not already frozen.
Route by config `worker`:
- **cloud** (or `worker:cloud` in hybrid): label `agent:codex loop:ready`; post
  `<!-- LOOP:ASSIGN agent=codex issue=NN contract=frozen -->`. Codex returns a PR that a
  later iteration verifies (step 1).
- **local** (or `worker:local` in hybrid): cut a fresh worktree off the default branch; hand
  the frozen contract to the **`codex:codex-rescue`** subagent with `--write` (one `task`
  call — it is a thin forwarder); run the `verify` command + the issue's Verification Plan in
  the worktree. Pass → commit (with config `trailer`) → push to the default branch → close →
  unblock successor. Fail → re-hand once via `--resume` with findings; second fail →
  `needs:human`.

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
<!-- LOOP:ASSIGN agent=codex issue=NN contract=frozen -->      Claude → Codex
<!-- LOOP:STATUS agent=codex issue=NN state=… pr=### ci=… -->  Codex → Claude (you READ these)
<!-- LOOP:VERIFY issue=NN pr=### verdict=pass|bounce -->        Claude's verdict
CODEX-LOOP:CONFIG block (Control Tower issue body)             config incl. state=RUN|PAUSE
```

## Guardrails (never weakened)
CI green before merge/deploy; never leave the default branch red. Prefer additive/idempotent
migrations; never reseed/drop live data or destroy audit trails without explicit issue
authorization. Deploy only when configured and the issue asks. Commit messages end with the
configured `trailer`. Park (don't act) on money/legal/external-comms/unauthorized-destructive/
ambiguous. Claude is the sole merger and deployer; Codex never merges or deploys.
