# Roadmap

Staged from "works today with zero new infra" to "fully unattended." Each phase is
independently useful; stop at any phase.

## Phase 0 — repo-agnostic engine (this repo)
**Status: done.**
- [x] Design, issue protocol, install docs.
- [x] `/codex-loop` skill: detect → scaffold → iterate → pace, no project hardcoded.
- [x] Config lives in the Control Tower issue; auto-detect + confirm-first scaffolding.
- [x] Installed globally with a target guard.

## Phase 1 — kill the manual restart (cloud worker, interactive)
**Goal: `/loop /codex-loop` runs the tick on a self-pacing cadence.** No change to how Codex
works — still cloud, still `LOOP:ASSIGN` + PRs. Only the orchestrator's restart is automated.
- [ ] First-run scaffold in the reference repo; confirm labels + Control Tower + config.
- [ ] Dry-run single ticks (`/codex-loop`) until behaviour matches a manual tick.
- [ ] Verify PAUSE is a soft, auto-resuming halt.
- [ ] Verify "queue drained" stop condition and the max-iterations backstop.
- [ ] Run under `/loop` for a full session; confirm no manual kick needed.

## Phase 2 — close the idle gap (local worker, in-session)
**Goal: no Codex process ever sits idle.** `worker=local` implements backend issues in a
worktree within the same iteration and verifies immediately.
- [ ] Worktree-per-issue isolation + cleanup.
- [ ] Local-worker branch: `codex:codex-rescue` → verify → commit → push.
- [ ] One-retry-then-park on failure (via `--resume`).
- [ ] Hybrid routing via `worker:local` / `worker:cloud`.
- [ ] Cost ceiling honoured (local Codex runs on the user's machine).

## Phase 3 — unattended cron (GATED)
**Goal: advances with the laptop closed** — a `/schedule` routine invoking `/codex-loop`.
Blocked until:
- [ ] Confirm headless auth for `gh` and any MCP the loop touches.
- [ ] Confirm the target repo's own policy allows unattended execution (some deployments
      deliberately restrict to interactive).
- [ ] Prove stop/park conditions hold unattended (extended Phase 1/2 dry run first).
- [ ] Explicit user sign-off.

## Phase 3.5 — wave orchestration & quality gates
**Goal: parallelize independent work and harden the merge gate** (reimplemented from
[barkain/claude-code-workflow-orchestration](https://github.com/barkain/claude-code-workflow-orchestration);
see [ORCHESTRATION.md](ORCHESTRATION.md)). All opt-in; defaults unchanged.
- [x] Design + config keys (`mode`, `concurrency`, `gates`) + skill wiring.
- [ ] Validate `mode=wave` live: parallel worktrees, serialized merges, no `main` races.
- [ ] Validate the `review` gate: independent verifier subagent bounces a bad diff.
- [ ] Optional `wave:N` labels + in-session Tasks mirror for progress.
- [ ] Decide `concurrency` ceiling + cost guard for parallel local Codex.

## Phase 4 — hardening
- [ ] Structured tick metrics on the Control Tower issue (throughput, bounce rate, parked
      count over time).
- [ ] Deterministic fan-out for the verify stage (a Workflow: verify N open PRs in parallel)
      when the PR queue is deep.
- [ ] Alerting when the loop parks or halts on red CI.
- [ ] Config schema validation + a `/codex-loop --check` dry mode.

## Non-goals
- Hardcoding any project into the skill. All project specifics stay in the Control Tower
  config block.
- Weakening guardrails (park rules, CI-green-before-merge, data safety). The engine inherits
  them structurally; it never relaxes them.
- Giving Codex merge/deploy authority. Claude remains the sole merger + deployer.
