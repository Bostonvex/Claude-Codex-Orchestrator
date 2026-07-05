# Changelog

All notable changes to codex-loop. Newest first.

## 0.1.0 — 2026-07-05

First complete, live-validated release of the engine.

### Added
- **Repo-agnostic engine** (`/codex-loop`): detect → scaffold → iterate → pace. No project
  hardcoded; all specifics live in the Control Tower issue's `CODEX-LOOP:CONFIG` block.
- **Auto-detect + confirm-first scaffolding** of the label set and a pinned Control Tower issue.
- **Plan intake** (`/codex-loop plan: …`): decompose a plan into assigned, chained,
  contract-frozen issues.
- **Workers**: `local` (default — `codex:codex-rescue` against a worktree, no idle gap),
  `cloud` (issue signal + `codex/*` PR), `hybrid` (per-issue `worker:*` routing).
- **Self-pacing** under `/loop` via `ScheduleWakeup`; `state=PAUSE` soft kill switch.
- **Wave orchestration** (`mode=wave`, `concurrency`): parallel worktrees, serialized merges,
  re-verify-after-rebase. Reimplemented from ideas in
  `barkain/claude-code-workflow-orchestration` (no code copied).
- **Quality gates** (`gates=verify,lint,typecheck,review,cleanup`) run before every merge.
- **Agent personas**: architect, context-analyzer, implementers, verifier, reviewer, cleanup,
  devops, documentation, dependency — owner-first + `role:*` + keyword routing.
- **Hardening**: `LOOP:METRICS` tick line, park/red-CI alerting, `/codex-loop --check` config
  validation, `workflows/verify-fanout.mjs` (deterministic parallel PR verification).
- **Docs**: DESIGN, ISSUE-PROTOCOL, ORCHESTRATION, PERSONAS, EXAMPLE-CYCLE, INSTALL, CRON,
  ROADMAP.

### Validated live (against a throwaway repo)
- Scaffold, manual-tick parity, PAUSE halt, queue drain.
- Local Codex worker end-to-end (worktree → implement → verify → merge).
- `--resume` continues the same Codex thread; two bounces → `needs:human` park.
- Hybrid `worker:*` routing.
- Wave mode (parallel worktrees + serialized merge; rebase-conflict → re-apply + re-verify).
- Review gate (verifier persona bounced a bad diff); persona dispatch (`role:docs`).

### Guarded / not enabled
- **Unattended cron (Phase 3)** — wiring documented in CRON.md; enabling it is a deliberate
  user sign-off, not a default.

### Fixed (found during validation)
- Unblock must **swap** `loop:blocked → loop:ready`, not just remove the block.
- Local worker must point Codex at the worktree via `-C/--cwd`.
- `gh issue list --label` is eventually consistent — trust in-session state / re-check.
