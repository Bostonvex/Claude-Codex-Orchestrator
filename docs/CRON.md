# Unattended cron (Phase 3) — wiring & sign-off

Running the loop with **no human watching**. Everything needed is built and validated; what
remains is a **deliberate decision only you should make**, because unattended autonomy is
exactly where a mistake compounds silently. This page is the checklist + the wiring so it's a
single toggle when you're ready.

## Why it's gated (not auto-enabled)

codex-loop's whole posture is "park for a human when unsure." Turning on a cron that merges and
deploys while you're away removes the human from the loop. That's legitimate for a mature,
well-behaved queue — but it's your call, per repo, not a default.

## Pre-flight checklist

| Check | Status | How |
|---|---|---|
| Headless `gh` auth | ✅ verified | token in keyring; `gh api user` works non-interactively |
| No interactive-only MCP the loop needs | ✅ n/a | the loop uses `gh` + local `codex`; neither needs interactive MCP |
| Local Codex reachable headless (`worker=local`) | ⚠️ confirm | `codex login status` on the machine the cron runs on; or use `worker=cloud` |
| Stop/park conditions proven | ⚠️ do first | run an **extended `/loop` dry run** (interactive) and confirm it parks + drains cleanly |
| Default-branch protection compatible | ⚠️ confirm | the cron account must be able to merge + push (see [INSTALL.md](INSTALL.md#github-permissions)) |
| **Explicit sign-off** | ⬜ **your call** | the gate below |

## The one decision

Enable unattended cron **only if all of these are true**:

- [ ] The queue has run cleanly under interactive `/loop` for a full session with no surprises.
- [ ] The park rules cover everything you'd want a human for in this repo (money/legal/
      external-comms/destructive migrations) — re-read them in the Control Tower config context.
- [ ] You accept that merges/deploys can happen while you're away, bounded by CI-green +
      the park rules + `state=PAUSE`.
- [ ] There's a cheap kill switch you trust: set `state=PAUSE` in the Control Tower config and
      the next tick no-ops.

## Wiring (when signed off)

Use the built-in `/schedule` skill to register a routine that invokes the loop:

```
/schedule create --name codex-loop-nightly \
  --cron "0 * * * *" \        # hourly; pick your cadence
  --prompt "/codex-loop"       # one tick per firing; the tick self-checks PAUSE first
```

Notes:
- **One tick per firing.** Each cron firing runs a single iteration and stops — the cron *is*
  the pacing, so you don't also wrap it in `/loop`. (Interactive use still prefers `/loop
  /codex-loop` for tight self-pacing.)
- **PAUSE is the kill switch.** `state=PAUSE` in the Control Tower config halts every firing
  until you set it back to `RUN` — no need to delete the routine to stop it.
- **Cadence.** Hourly during working weeks is a sane start; the loop no-ops cheaply when the
  queue is drained, so an idle firing costs almost nothing.
- **Disable.** `/schedule delete codex-loop-nightly`, or just leave `state=PAUSE`.

## Recommended rollout

1. Interactive `/loop /codex-loop` for a few real sessions → build confidence.
2. A **daytime** cron (you're around to watch) at a slow cadence.
3. Only then, an overnight/unattended cadence.

Skipping straight to unattended overnight is the one path this doc exists to discourage.
