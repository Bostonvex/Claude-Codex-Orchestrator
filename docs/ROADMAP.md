# Roadmap

Staged from "works today with zero new infra" to "fully unattended." Each phase is
independently useful; stop at any phase.

## Phase 0 — documentation (this repo)
**Status: in progress.**
- [x] Design, issue protocol, install docs.
- [x] `/codex-loop` skill draft (cloud worker path).
- [ ] Review the park list against auspicia `CLAUDE.md` verbatim before anything runs live.

## Phase 1 — kill the manual restart (cloud worker, interactive)
**Goal: `/loop /codex-loop` runs the existing tick on a self-pacing cadence.** No change to
how Codex works — still cloud, still `LOOP:ASSIGN` + `codex/*` PRs. Only the *orchestrator's*
restart is automated.
- [ ] Install skill into auspicia (`.claude/skills/codex-loop`).
- [ ] Dry-run single ticks (`/codex-loop`) until behaviour matches the current manual tick.
- [ ] Verify PAUSE is honoured as a soft, auto-resuming halt.
- [ ] Verify "queue drained" stop condition and the max-iterations backstop.
- [ ] Run under `/loop` for a full work session; confirm no manual kick needed.

## Phase 2 — close the idle gap (local worker, in-session)
**Goal: no Codex process ever sits idle.** Add the `codex:codex-rescue --write` worker so
backend issues are implemented in a worktree *within the same iteration* and verified
immediately.
- [ ] Worktree-per-issue isolation + cleanup.
- [ ] Local-worker branch of the engine: rescue → CI → verify → commit → push.
- [ ] One-retry-then-park on failure (via `--resume`).
- [ ] Hybrid routing: `worker:local` / `worker:cloud` labels (or a size heuristic).
- [ ] Cost ceiling honoured (local Codex runs on the user's machine).

## Phase 3 — unattended cron (GATED)
**Goal: advances with the laptop closed.** A `/schedule` routine invoking `/codex-loop`.
**Blocked until:**
- [ ] Document *why* auspicia disabled the headless `claude -p` / launchd driver
      ("interactive-only") — do not silently re-enable a deliberate decision.
- [ ] Confirm headless auth for `gh` and any MCP the loop touches.
- [ ] Prove the stop/park conditions hold with no human watching (extended dry run under
      Phase 1/2 first).
- [ ] Explicit user sign-off.

## Phase 4 — hardening
- [ ] Structured tick metrics on #175 (throughput, bounce rate, parked count over time).
- [ ] Deterministic fan-out for the verify stage (a Workflow: verify N open PRs in
      parallel) when the PR queue is deep.
- [ ] Alerting when the loop parks or halts on red CI.

## Non-goals
- Weakening any auspicia guardrail (park rules, CI-green-before-merge, additive DDL,
  audit-trail preservation). codex-loop inherits them verbatim; it never relaxes them.
- Giving Codex merge/deploy authority. Claude remains the sole merger + deployer.
