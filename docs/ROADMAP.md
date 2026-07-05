# Roadmap

Staged from "works today with zero new infra" to "fully unattended." Most items are now
**validated live** against a throwaway repo (`codex-loop-scratch`) — the evidence is noted
inline. The only phase that stays open is Phase 3, which is **user-gated by design**.

## Phase 0 — repo-agnostic engine  ✅ done
- [x] Design, issue protocol, install docs.
- [x] `/codex-loop` skill: detect → scaffold → iterate → pace, no project hardcoded.
- [x] Config lives in the Control Tower issue; auto-detect + confirm-first scaffolding.
- [x] Installed globally with a target guard.

## Phase 1 — kill the manual restart (interactive)  ✅ done
- [x] First-run scaffold — *validated: 8 labels + pinned Control Tower issue + config block
      created live.*
- [x] Single ticks match a manual tick — *validated: full tick run by hand (assign → verify →
      merge → implement → close) on the scratch repo.*
- [x] PAUSE is a soft, auto-resuming halt — *validated: guard reads `state=PAUSE` → no-op;
      auto-resumes on `RUN` under `/loop`.*
- [x] "Queue drained" stop + max-iterations backstop — *drain validated (count → 0); the
      iteration/cost backstop is enforced in the pace step.*
- [x] Run under `/loop` — *tick mechanics validated end-to-end; the cadence wrapper is the
      built-in `/loop` skill (self-paced via `ScheduleWakeup`).*

## Phase 2 — close the idle gap (local worker)  ✅ core done
- [x] Worktree-per-issue isolation + cleanup — *validated: worktrees created/removed each run.*
- [x] `codex:codex-rescue` → verify → commit → push — *validated live: local Codex implemented
      issue #6 (and wave issue #7) against a worktree; independently re-verified before merge.*
- [x] Point Codex at the worktree (`-C/--cwd`) — *found + fixed: the rescue subagent runs in the
      session cwd, so the worktree must be passed explicitly.*
- [x] One-retry-then-park via `--resume` — *validated: bounced attempt #1, `--resume-last`
      continued the **same Codex thread** (`019f32f2…` matched), bounced again → issue swapped to
      `needs:human` and left the ready queue.*
- [x] Hybrid `worker:local`/`worker:cloud` routing — *validated: `worker=hybrid` routed a
      `worker:local` issue to the codex-rescue path and a `worker:cloud` issue to `LOOP:ASSIGN`.*
- [x] Cost ceiling — *local Codex bills the ChatGPT/Codex subscription (verified via
      `codex login status`); concurrency clamp + backstop documented.*

## Phase 3 — unattended cron  🔒 USER-GATED (wiring ready; toggle is yours)
Enabling this means running the loop with no human watching — a deliberate decision only you
should make. **Everything is built and documented in [CRON.md](CRON.md)**; what's left is your
sign-off.
- [x] Headless `gh` auth — *verified: token-in-keyring, `gh api user` works non-interactively.*
- [x] Wiring documented — `/schedule` routine + PAUSE kill switch + rollout plan in CRON.md.
- [ ] Target repo's own policy allows unattended execution — **your call.**
- [ ] Stop/park conditions proven over an extended unattended run — needs a long dry run first.
- [ ] **Explicit user sign-off** — the gate. Not something the engine grants itself.

## Phase 3.5 — wave orchestration, quality gates & personas  ✅ done
- [x] Config keys (`mode`, `concurrency`, `gates`) + skill wiring.
- [x] Persona catalog + `role:*` routing + keyword auto-assign — [PERSONAS.md](PERSONAS.md).
- [x] `mode=wave` live — *validated: `clamp` (local Codex) + `slugify` (Claude) implemented in
      parallel worktrees; serialized merge; #8's rebase **conflicted** (same file) so it was
      re-applied on the updated `main` and re-verified — both landed, `main` green (7/7), no
      race. Surfaced the "re-verify after rebase / independence = no file overlap" rule.*
- [x] `review` gate — *validated: the verifier persona **bounced** a deliberately-wrong `clamp`
      diff with a correct, precise finding and a compact return.*
- [x] Persona dispatch — *validated: a `role:docs` issue routed to the documentation persona,
      which edited docs only (0 code files touched) and returned `DONE|<path>`.*
- [x] `wave:N` labels + in-session Tasks mirror — documented as **optional** view-only tracking
      in [ORCHESTRATION.md](ORCHESTRATION.md#structured-tracking-optional).
- [x] `concurrency` ceiling + cost guard — clamp to ≈ CPU−2 + backstop, in the skill.

## Phase 4 — hardening  ✅ done
- [x] Structured tick metrics — `LOOP:METRICS tick=… ready=… merged=… bounced=… parked=…`
      line on every Control Tower tick, greppable over time.
- [x] Deterministic verify fan-out — shipped [`workflows/verify-fanout.mjs`](../workflows/verify-fanout.mjs)
      (validated as a valid async workflow body): parallel per-PR verification + adversarial
      double-check of passes; returns verdicts (the orchestrator still does the merges).
- [x] Alerting on park / red CI — `PushNotification` + a `needs:human` note; silent parking is
      called out as the failure mode to avoid.
- [x] Config schema validation + `/codex-loop --check` dry mode — validates keys/values/worker
      dependency and reports without running.

## Remaining (honest)
- **Phase 3 sign-off (yours)** — the only true blocker; wiring is ready in [CRON.md](CRON.md).
- `mode=wave` proven at `concurrency=2` and the fan-out Workflow validated as a body but not
  yet run at high fan-out against a deep real queue.
- `worker=cloud` end-to-end depends on an externally-wired Codex Cloud agent (the skill posts
  the assignment; the PR round-trip was validated by simulating the worker).

## Non-goals
- Hardcoding any project into the skill. All project specifics stay in the Control Tower config.
- Weakening guardrails (park rules, CI-green-before-merge, data safety).
- Giving Codex merge/deploy authority. Claude remains the sole merger + deployer.
