# Changelog

All notable changes to codex-loop. Newest first.

## 0.2.0 — 2026-07-06

### Added
- **Handoff as an audit log.** The Claude→Codex handoff now carries a structured, debuggable
  contract, so a bad merge triages to *underspecified* vs *scope violation* vs *wrong verification*
  from the issue alone:
  - **`LOOP:CONTRACT`** — the frozen handoff block in the issue body: interface, **in scope** and
    **out of scope — do NOT touch**, acceptance criteria, verify command, and **context loaded** vs
    **assumptions** (provenance of what Claude read vs assumed).
  - **`LOOP:HANDBACK`** — a receipt posted on every return: changed files from
    `git diff --name-only` (not prose), a **scope check** (changed ∩ out-of-scope → clean/violation),
    and tests **claimed by Codex** (from the `-o` result / PR body) vs **actually run by Claude**.
  - **`LOOP:FALLBACK`** — a structured escalation reason
    (`stall|deadline|verify-fail|scope-violation|direction-change`) alongside the JSONL evidence.
- **Scope-violation is a first-class bounce** — a diff that touches out-of-scope paths bounces even
  if the tests pass.
- **Audit invariant** — no `agent:codex` issue merges/closes without the full
  `LOOP:CONTRACT → ASSIGN → HANDBACK → VERIFY` chain; merging over a `scope=violation` handback is a
  guardrail breach.

Backward-compatible: issues without a `LOOP:CONTRACT` still run (the scope check is an advisory
no-op); freezing one is required for `agent:codex` work going forward.

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
