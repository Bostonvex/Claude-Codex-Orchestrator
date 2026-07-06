# Changelog

All notable changes to codex-loop. Newest first.

## 0.1.1 — 2026-07-06

### Changed
- **Local worker is now an observable, bounded, fallible background process.** The old blocking
  `codex:codex-rescue` subagent made a 20-minute stall indistinguishable from real progress. The
  loop now preflights `codex doctor`, then runs
  `codex exec --json -C <worktree> -s workspace-write -o codex-<NN>.result > codex-<NN>.jsonl` in
  the background and **watches the JSONL** — a growing log means working, a frozen one means hung.
  On stall / deadline / verify-fail it kills the run, posts the last ~40 JSONL lines + the `-o`
  result for debugging, and falls back, so a wedged Codex never blocks the queue.

### Added
- **Config knobs** `codexTimeoutSec` (default 900), `codexStallSec` (default 240), and `fallback`
  (`claude` \| `park`) in the Control Tower `CODEX-LOOP:CONFIG` block.
- **JSON trajectory viewer** — [`tools/codex-json-viewer.html`](tools/codex-json-viewer.html), a
  single dependency-free HTML file that renders a `codex-<NN>.jsonl` run (drag-drop / open / paste):
  the agent's reasoning, shell commands with exit codes + output, and file edits, in order, with
  type filters, text search, and a token-usage summary. Runs entirely in the browser — nothing is
  uploaded.

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
