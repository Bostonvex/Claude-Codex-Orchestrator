# Full-cycle example

An end-to-end walkthrough of one feature going from a plan to shipped, entirely through the
loop: **plan → issues (assigned + chained) → run → loop iterations → drain**. Everything
below is what you and the skill actually type/produce. The repo here is generic; substitute
your own. Assume the skill is [installed](INSTALL.md) and the repo is already scaffolded
(Control Tower issue = **#7**, `state=RUN`).

This walkthrough deliberately sets **`worker=cloud`** so you can see the full async
assign → PR → verify round-trip and the `LOOP:*` trail it leaves. The default, `worker=local`,
collapses that round-trip into a single iteration — shown under [Variations](#variations).

---

## Step 1 — Write the plan

You draft a short plan (a file, or just paste it into the prompt). Keep it outcome-oriented;
the skill handles decomposition.

```markdown
# Plan: CSV export for reports

Goal: a user viewing a report can download it as CSV.

1. Backend endpoint: GET /api/reports/:id/export.csv → streams the report as CSV.
2. Frontend: an "Export CSV" button on the report page that hits that endpoint.
3. Backend: rate-limit the export endpoint (10/min/user) so it can't be abused.
```

---

## Step 2 — Break the plan into issues (Phase B+ intake)

You invoke the skill with the plan:

```
/codex-loop plan: docs/PLAN-csv-export.md
```

The skill decomposes it, assigns owners, chains dependencies, freezes the Codex contracts,
and **shows you the proposal before creating anything**:

```
Proposed issues (3) — confirm to create:

#  Title                         Owner         Labels                    Blocked on
── ───────────────────────────── ───────────── ───────────────────────── ──────────
1  CSV export endpoint           agent:codex   agent:codex, loop:ready    —
2  Export CSV button             agent:claude  agent:claude, loop:blocked #1
3  Rate-limit export endpoint    agent:codex   agent:codex, loop:blocked  #1

Contracts frozen for the two agent:codex issues. Create these 3 issues? [y/N]
```

You confirm. It opens them (numbers assigned by GitHub → **#12, #13, #14**) and posts an
intake summary on the Control Tower issue. Issue **#12** now looks like:

```
Title: CSV export endpoint
Labels: agent:codex, loop:ready

## Contract (frozen)
Route:   GET /api/reports/:id/export.csv
Auth:    same as GET /api/reports/:id
Output:  text/csv; header row = report columns; one row per record; RFC-4180 quoting
Errors:  404 if report not found / not owned; 200 otherwise
Accept:  a request for a known report returns CSV whose header + first row match the JSON API

## Verification Plan
- pytest: new test hits the route for a seeded report, asserts content-type + header row
- curl the route in the dev server, diff against the JSON payload
```

`#13` (frontend, `loop:blocked` on #12) and `#14` (rate-limit, `loop:blocked` on #12) are
created the same way. The queue is now: **#12 ready**, **#13 blocked**, **#14 blocked**.

---

## Step 3 — Start the loop

```
/loop /codex-loop
```

From here it runs hands-off. Each iteration is one pass of the engine; the skill schedules
its own next wake. Below is what happens, iteration by iteration.

### Iteration 1 — assign the ready backend issue

```
guard:    state=RUN, tree clean, nothing to park → proceed
verify:   no LOOP:STATUS state=pr-open comments → nothing to verify
codex:    next agent:codex loop:ready = #12. Contract already frozen.
          worker=cloud → activate Codex:
              label #12 agent:codex loop:ready   (already set)
              comment #12:
              <!-- LOOP:ASSIGN agent=codex issue=12 contract=frozen -->
claude:   no agent:claude loop:ready issue (#13 is blocked) → nothing to implement
deploy:   config deploy= empty → skip
log:      Control Tower #7 tick comment (below)
pace:     work happened, PR pending → ScheduleWakeup ~600s
```

Control Tower (#7) tick log:

```
<!-- codex-loop tick -->
## Current State
Queue — codex: 1 ready→assigned (#12), 1 blocked (#14). claude: 0 ready, 1 blocked (#13).
## Changed
Assigned #12 to Codex (contract frozen).
## Verification / Deployment
none this tick.
## Risks-Unknowns
none.
## Next Recommended Step
Await Codex PR for #12; verify next tick.
```

*(Between iterations, the externally-wired Codex Cloud agent picks up #12, implements it, and
opens a `codex/*` PR — posting `<!-- LOOP:STATUS agent=codex issue=12 state=pr-open pr=41 -->`
on the issue.)*

### Iteration 2 — verify + merge, unblock the chain, fan out

```
guard:    proceed
verify:   #12 has LOOP:STATUS state=pr-open pr=41, no later LOOP:VERIFY → verify it
              gh pr checkout 41
              run verify (auto-detected: python -m pytest -q) + the issue's Verification Plan
              review diff vs the frozen contract → PASS
              gh pr merge 41 --squash
              comment #12: <!-- LOOP:VERIFY issue=12 pr=41 verdict=pass -->  + six headings
              close #12
              unblock chain: swap #13 and #14 from loop:blocked → loop:ready
                (--remove-label loop:blocked --add-label loop:ready; removing alone
                 wouldn't make them match the loop:ready pickup query)
codex:    next agent:codex loop:ready = #14. Freeze already done → activate Codex:
              <!-- LOOP:ASSIGN agent=codex issue=14 contract=frozen -->
claude:   agent:claude loop:ready = #13 → implement directly:
              git reset --hard origin/main   (picks up merged #12)
              add the Export CSV button, wire to the endpoint
              run verify (npm ci && npm test) → green
              commit (with configured trailer) → push origin HEAD:main
              close #13; nothing downstream to unblock
deploy:   config deploy= empty → skip
log:      Control Tower tick comment
pace:     PR pending for #14 → ScheduleWakeup ~270s
```

Now: **#12 closed**, **#13 closed**, **#14 assigned (PR pending)**.

### Iteration 3 — verify the last issue, drain

```
guard:    proceed
verify:   #14 has LOOP:STATUS state=pr-open pr=42 → verify
              checkout → run verify + plan → review diff → PASS
              merge pr 42, LOOP:VERIFY verdict=pass, close #14
codex:    no agent:codex loop:ready remaining
claude:   no agent:claude loop:ready remaining
deploy:   skip (deploy= empty)
log:      Control Tower tick: "queue drained"
pace:     both queues empty → post "queue drained" on #7 and STOP the loop
```

---

## Step 4 — Loop complete

The loop has drained and stopped on its own — no manual restart at any point. Final state:

- **#12, #13, #14** — all closed, each with a `LOOP:VERIFY verdict=pass` trail and a
  six-heading handover comment.
- **Control Tower #7** — a tick log per iteration ending in "queue drained".
- **`main`** — carries the merged endpoint, button, and rate-limit; CI green throughout.
- The feature from the plan is shipped.

To ship more, add issues (or run another `/codex-loop plan: …`) and the loop wakes back up.

---

## Variations

- **`worker=local`.** Iterations 2–3 wouldn't wait for an external PR. When #12 is picked,
  Claude cuts a worktree and calls `codex:codex-rescue --write` to implement it *in the same
  iteration*, then verifies and pushes immediately — no `LOOP:STATUS`/PR round-trip, no idle
  gap. Same issue-state trail, tighter wall-clock.

- **A bounce.** If verify had failed, Iteration 2 would post
  `<!-- LOOP:VERIFY issue=12 pr=41 verdict=bounce -->` with reproducible findings and leave
  #12 `agent:codex loop:ready` for Codex to redo. Two consecutive bounces → `needs:human`.

- **A park.** If the plan had included, say, a vendor-billing change, intake would have
  flagged that unit and the loop would label it `needs:human` and note it on #7 rather than
  assign it — the rest of the chain still runs.

- **Pause mid-flight.** Set `state=PAUSE` in #7's config block; the next iteration no-ops and
  the loop backs off, auto-resuming when you set it back to `RUN`. Every closed issue and
  merged PR stays put — state lives in GitHub, so nothing is lost.
