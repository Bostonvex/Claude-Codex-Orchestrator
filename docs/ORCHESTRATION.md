# Wave orchestration & quality gates

Augments codex-loop with dependency-analyzed **parallel waves** and a configurable
**quality-gate** pipeline. Concepts are **reimplemented from scratch** — inspired by
[barkain/claude-code-workflow-orchestration](https://github.com/barkain/claude-code-workflow-orchestration)
(no code copied), adapted to codex-loop's two-agent, GitHub-issue-driven model.

Everything here is **opt-in**: the defaults (`mode=sequential`, `concurrency=1`,
`gates=verify`) reproduce today's behaviour exactly. Turn it up per repo in the Control Tower
config.

---

## What we borrowed, and how it maps

| Their concept | codex-loop reimplementation |
|---|---|
| Delegate work to **specialized agents** (soft nudge away from the main agent doing it all) | Already core: Codex implements `agent:codex`; Claude does `agent:claude` + orchestration. We add specialized **quality-gate agents** (verifier, reviewer, cleanup). |
| **Plan-mode** task decomposition | Phase B+ intake decomposes a plan into issues, now producing an explicit **dependency graph + wave assignment**. |
| Parallel **waves** of independent phases | **Wave scheduling**: every unblocked `loop:ready` issue is processed concurrently, up to `concurrency`, each backend worker in its own worktree. |
| **Dependency analysis** | Reuse the existing `loop:blocked` chains (`blocked on #N`). The set of ready issues whose predecessors are merged *is* the current wave. |
| **Tasks API** metadata (wave/phase/agent/deps) | GitHub issues stay the source of truth; optional `wave:N` labels + `blocked on #N` in the body; optional in-session Tasks mirror for a live progress view. |
| **Quality gates** (hard Ruff/Pyright block) | Configurable `gates` run before every merge: `verify`, `lint`, `typecheck`, `review`, `cleanup` — a failing gate bounces the issue. |
| **task-completion-verifier** + verification phase | An independent **verifier subagent** adversarially checks each diff against the issue's acceptance criteria before merge (the `review` gate). |
| Subagent isolation + `DONE\|{path}` scratchpad returns | Parallel gate subagents return a short **verdict pointer**, not full diffs, to keep the orchestrator's context small. |
| Experimental **team mode** (inter-agent chat) | Out of scope for now; noted as future. |
| Soft-enforcement **nudge hooks** | Not adopted — codex-loop is invoked deliberately, so there's nothing to nudge. Optional future hook layer. |
| Token-efficiency stub injection | Plugin-internal; not relevant to a skill. |

---

## The augmented iteration (wave mode)

```
Phase C, mode=wave, concurrency=K:

  guard  (PAUSE / dirty tree / park — unchanged)

  1. Verify open Codex PRs  (unchanged; also runs the gate pipeline below)

  2. Compute the WAVE:
       ready = issues labeled loop:ready whose "blocked on #N" predecessors are all merged
       (split by owner: agent:codex vs agent:claude)

  3. Process the wave concurrently, up to K at once:
       agent:codex issue → local Codex in its OWN worktree (isolated) ─┐
       agent:claude issue → Claude implements in its own worktree ─────┤
                                                                        ▼
                                                        ── GATE PIPELINE ──
       for each finished issue, in order (gates are per-issue):
         verify → [lint] → [typecheck] → [review agent] → [cleanup] → pass?
            pass  → serialize the merge/push onto the default branch (rebase; retry)
                    → close → unblock successors (swap loop:blocked → loop:ready)
            fail  → bounce (Codex: --resume once, then needs:human; Claude: fix in-place)

  4. Log a WAVE SUMMARY to the Control Tower (per-issue outcome + gate results)

  5. Pace  (unchanged)
```

Two hard rules that keep parallelism safe:

- **Implement in parallel, merge in series.** Multiple worktrees can *build* at once, but
  pushes to the default branch are serialized (rebase-and-retry) so two workers never race
  the branch. This is why `concurrency` speeds up implementation without corrupting `main`.
- **Isolation per worker.** Each concurrent worker gets a fresh worktree off the current
  default branch — no shared working tree, no cross-talk. Worktrees are removed after.

---

## Quality gates

A per-issue pipeline that runs **before merge**. Configure which gates are active with the
`gates` config key (comma-separated, in order). A gate that fails **bounces** the issue.

| Gate | What it does | Backed by |
|---|---|---|
| `verify` | the `verify` command + the issue's Verification Plan (existing behaviour) | config `verify` / auto-detect |
| `lint` | run the repo's linter on the diff | auto-detect (`eslint`, `ruff`, …) or `verify`-style config |
| `typecheck` | run the type checker | auto-detect (`tsc`, `pyright`, `mypy`, …) |
| `review` | an **independent verifier/reviewer subagent** reads the diff and judges it against the issue's acceptance criteria, adversarially; blocking findings bounce the issue | `code-reviewer` agent / the `/code-review` skill |
| `cleanup` | an optional simplify/cleanup pass on the diff before merge | the `/simplify` skill / a cleanup subagent |

Gate subagents return a compact verdict (`pass` / `bounce` + findings pointer), never the full
diff, so a wide wave doesn't blow up the orchestrator's context.

### Their 8 agents → our personas

Recreated as a full persona catalog with briefs, backings, and label-based routing — see
**[PERSONAS.md](PERSONAS.md)**. Summary of the mapping:

| Their agent | Our persona |
|---|---|
| tech-lead-architect | **architect** (Plan / plan-mode; freezes contracts at intake) |
| codebase-context-analyzer | **context-analyzer** (`Explore`) |
| task-completion-verifier | **verifier** (the `review` gate, adversarial) |
| code-reviewer | **reviewer** (`/code-review`) |
| code-cleanup-optimizer | **cleanup** (`/simplify`) |
| devops-experience-architect | **devops** (`role:devops`; owns deploy config + smoke checks) |
| documentation-expert | **documentation** (`role:docs`) |
| dependency-manager | **dependency** (`role:deps`; additive/safe bumps) |

Selection is owner-first, then `role:*` label, then keyword auto-assign at intake.

---

## Config keys added

Set these in the Control Tower `CODEX-LOOP:CONFIG` block. All default to today's behaviour.

| Key | Values | Default | Effect |
|---|---|---|---|
| `mode` | `sequential` \| `wave` | `sequential` | `wave` processes the whole ready set concurrently; `sequential` does one issue per tick. |
| `concurrency` | integer ≥ 1 | `1` | Max issues implemented at once in wave mode. Merges still serialize. |
| `gates` | comma list of `verify,lint,typecheck,review,cleanup` | `verify` | Which quality gates run before merge; a failing gate bounces the issue. |

---

## Structured tracking (optional)

GitHub issues remain the single source of truth. On top of that, wave mode may:

- add `wave:N` labels for at-a-glance grouping (cosmetic; the ready set is authoritative),
- mirror the current wave into the in-session **Tasks API** (`TaskCreate`/`TaskUpdate`) so
  `/workflows`-style progress is visible while the wave runs — the mirror is a *view*, never
  the source of truth. If the session dies, the GitHub state fully reconstructs it.

---

## Scope & attribution

This is an independent reimplementation of ideas from
`barkain/claude-code-workflow-orchestration` — the parallel-wave scheduling, plan-mode
decomposition, specialized-agent quality gates, and context-efficient subagent returns. No
source from that project is used or vendored. Its plugin-internal machinery (nudge hooks,
token-stub injection, team mode) was intentionally **not** adopted, because codex-loop is a
deliberately-invoked, issue-driven loop rather than a general delegation nudger.
