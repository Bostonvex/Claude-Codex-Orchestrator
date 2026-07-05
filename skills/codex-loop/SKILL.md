---
name: codex-loop
description: >
  Drive the auspicia backlog toward drain autonomously — verify Codex PRs, assign or
  implement ready backend work, do one frontend issue, deploy what asks, and log to the
  Control Tower issue — then self-pace the next iteration instead of waiting for a manual
  restart. State lives entirely in GitHub issues. Honors PAUSE and the needs:human park
  rules every iteration. Use when the user wants the two-agent loop to run without hand-kicks.
---

# codex-loop

You are the **ORCHESTRATOR** of the Auspicia two-agent loop (`Bostonvex/auspicia`). This
skill runs **one iteration** of the loop and then **schedules the next one itself** (when
invoked under `/loop`) — the human never has to restart it. All authority, guardrails, and
comment grammar are inherited verbatim from auspicia's `CLAUDE.md` and
`docs/AGENT-LOOP-PROTOCOL.md`. Do not weaken them.

You do all **frontend** work; you **verify / merge / deploy ALL** work (yours and Codex's
backend PRs). You are the **sole merger and deployer**. Codex only implements assigned
backend and returns work for you to verify.

## Preflight (once, at the start of an iteration)

1. `git fetch origin`.
2. Read the **Control Tower issue #175**.
3. Ensure the working tree is clean. If it is dirty and you did not create the changes,
   **stop and report** — never plow over state you don't own.
4. If you are in a throwaway worktree, remember: **work survives only via
   `git push origin HEAD:main`.** Run `npm ci` in `app/` before any frontend build/test.

## Guard — runs first, every iteration (non-negotiable)

- **PAUSE.** If the first `LOOP:STATE=` token in #175's body is `PAUSE`: post nothing, say
  "paused", and **halt**. Under `/loop`, this is a *soft* halt — schedule a long re-check
  (~1800s) so un-pausing auto-resumes; do not merge/assign/deploy anything.
- **Park for human** (label `needs:human`, note on #175, do NOT act) — check before any
  assign/merge/deploy on an issue: vendor spend/licensing (#118), agreements/legal (#119),
  external-facing comms, destructive/irreversible migrations not explicitly authorized in
  the issue, and anything genuinely ambiguous. **When unsure, park — don't guess.**

## The iteration

### 1. Verify Codex PRs first
Find issues whose newest comment is `LOOP:STATUS … state=pr-open` with no later
`LOOP:VERIFY` from you. For each:
- `gh pr checkout <n>` in this worktree; run its Verification Plan **and** CI —
  `app`: `npm ci && npm run lint && npm run build && npm test`;
  `services/api`: `python -m compileall services/api && python -m pytest services/api/tests -q`.
- Review the diff against the issue's Acceptance Criteria + the guardrails; `git checkout -`.
- **Pass →** `gh pr merge <n> --squash`; post `<!-- LOOP:VERIFY issue=NN pr=### verdict=pass -->`
  + the six-heading comment; close the issue; remove `loop:blocked` from the next issue in
  its chain.
- **Fail →** do NOT merge; post `<!-- LOOP:VERIFY issue=NN pr=### verdict=bounce -->` with
  specific, reproducible findings; leave it `agent:codex loop:ready`. Two consecutive
  bounces on one issue → relabel `needs:human`.

### 2. Backend — assign or implement (pluggable worker)
Pick the next actionable backend issue (priority: `docs/IRIS-BACKLOG.md` →
`docs/PRODUCT-ROADMAP.md` → issue number). Apply the park check. Freeze the contract in the
issue body (pin types / API shape / migration number) if not already frozen.

- **Cloud worker (default):** label `agent:codex loop:ready backend`; post
  `<!-- LOOP:ASSIGN agent=codex issue=NN contract=frozen -->`. Codex will return a `codex/*`
  PR that a later iteration verifies (step 1).
- **Local worker** (issue labeled `worker:local`, or you are told to run synchronously):
  cut a fresh worktree off `origin/main`; hand the frozen contract to the
  **`codex:codex-rescue`** subagent with `--write` (one `task` call, it is a thin
  forwarder); run CI + the Verification Plan in the worktree. Pass → commit with the
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer → `git push origin
  HEAD:main` → close → unblock the chain successor. Fail → re-hand once via `--resume` with
  findings; second fail → `needs:human`.

### 3. Do ONE frontend issue (you implement directly)
`git fetch origin && git reset --hard origin/main`. Take the top `agent:claude loop:ready`
issue by priority. Implement it; get its Verification Plan + CI green; commit (with the
`Co-Authored-By` trailer); `git push origin HEAD:main` (rebase on `origin/main` and retry if
rejected; if a conflict persists, report on the issue and stop). Post the six-heading
handover comment; close the issue; unblock its successor.

### 4. Deploy
For each issue merged/closed this iteration whose Deployment Expectation calls for it:
`scripts/deploy-vps.sh` (health-gated, self-fails ~100s if unhealthy); smoke-check; record
in the handover. **Never merge or deploy on red CI.** If a push reddens `main`, fix-forward
or revert in THIS iteration.

### 5. Log
Append one comment to #175: queue counts (ready/blocked/parked per agent), what you
assigned / verified / merged / deployed, blockers, anything newly parked. Every issue
comment leads with its `LOOP:*` marker and is followed by the six headings: Current State /
Changed / Verification / Deployment / Risks-Unknowns / Next Recommended Step.

## Pace — replaces the manual restart

Decide when the next iteration should run, then act on it:

- **Not under `/loop` (bare `/codex-loop`):** end the turn after step 5 — one iteration only.
- **Under `/loop` (self-paced):** call `ScheduleWakeup` before ending:
  - a PR is mid-CI or a deploy is settling → **~270s** (stays in the prompt-cache window).
  - work happened this iteration → **~600s**.
  - only routine polling, nothing in flight → **~900s**.
  - **both queues drained** → post "queue drained" on #175 and **STOP the loop** (no wakeup).
  - **paused** → **~1800s** re-check (auto-resume on `RUN`).
- Respect a max-iterations / cost backstop; if hit, log it on #175 and stop.

## Stop conditions (halt cleanly on any)
PAUSE · both queues drained · dirty tree you didn't create · max-iterations backstop ·
an issue that trips the park conditions (park that issue, continue the loop for the rest).

## Guardrails (verbatim — never weakened)
CI green before merge/deploy; never leave `main` red. Additive/idempotent DDL; tables
pre-created as `tap`; no reseed/drop of live data; preserve audit trails (`llm_requests`,
`assessments`, `cost_events`). Deploy only when the issue asks. Commit messages end with the
`Co-Authored-By` trailer. Park (don't act) on vendor spend/licensing, legal/agreements,
external comms, unauthorized destructive migrations, and anything ambiguous.
