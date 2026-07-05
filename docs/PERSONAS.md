# Agent personas

codex-loop's two base roles are **Claude** (orchestrate + implement `agent:claude`) and
**Codex** (implement `agent:codex`). On top of that, this catalog adds **specialized
personas** — the loop dispatches the right expert for the job instead of doing everything with
one generic implementer.

Reimplemented from the specialized-agent idea in
[barkain/claude-code-workflow-orchestration](https://github.com/barkain/claude-code-workflow-orchestration)
(no prompts or code copied — the briefs below are ours). Each persona is realized as an
**isolated subagent or skill**, given a tight brief, and returns a **compact result**
(a verdict or a scratchpad pointer), never a full diff — so a wide wave doesn't blow up the
orchestrator's context.

---

## The catalog

| Persona | Job (one line) | Backed by | Reads/writes |
|---|---|---|---|
| **architect** | Decompose a plan/large issue; choose the approach; **freeze the contract** (API shape, types, migration id, acceptance criteria) | `Plan` agent / plan mode | read-only → writes the issue body |
| **context-analyzer** | Map the relevant code area *before* implementing; return where things live + risks | `Explore` agent | read-only → brief |
| **codex-implementer** | Write backend/data/API/migration code to the frozen contract | `codex:codex-rescue` (local) or cloud Codex | writes a worktree / PR |
| **claude-implementer** | Write UI, glue, orchestration code | Claude, directly | writes a worktree |
| **verifier** | Adversarially check the diff satisfies the issue's acceptance criteria + Verification Plan | `general-purpose` subagent | read-only → `pass`/`bounce` + findings |
| **reviewer** | Review the diff for bugs, security, quality | `/code-review` (or `code-reviewer` agent) | read-only → findings |
| **cleanup** | Simplify/dedupe the diff before merge (quality only) | `/simplify` | writes the worktree |
| **devops** | CI/deploy/infra issues; wire the deploy command + smoke checks | Codex or Claude w/ devops brief | writes; touches deploy config |
| **documentation** | Docs issues; keep README/docs in sync with the change | `general-purpose` subagent w/ docs brief | writes docs |
| **dependency** | Dependency upgrades/audits; additive, safe bumps only | Codex w/ dependency brief | writes lockfiles/manifests |

The first four are the *implementation spine*; the rest are **gate and specialist** personas
that engage based on the issue's nature or the active `gates`.

---

## How a persona is selected

1. **Owner first.** `agent:codex` → codex-implementer; `agent:claude` → claude-implementer.
   That's unchanged and always applies.
2. **Specialist by label.** An optional `role:<persona>` label routes an issue to a specialist
   (e.g. `role:devops`, `role:docs`, `role:deps`, `role:architect`). Role labels are created
   on demand — scaffolding doesn't pre-create them, to avoid label sprawl.
3. **Auto-assign at intake by keywords** (reimplements their keyword matching). During Phase B+
   plan intake, tag each issue with a `role:` when its title/body clearly matches:

   | Keywords in the issue | Persona |
   |---|---|
   | design, architecture, approach, RFC, "how should we" | architect |
   | deploy, CI, pipeline, docker, infra, release, rollout | devops |
   | docs, README, changelog, guide, comment | documentation |
   | upgrade, bump, dependency, CVE, audit, lockfile | dependency |

   No match → just the owner's implementer persona. When unsure, don't tag — let the owner
   handle it.

---

## Where personas plug into the loop

```
Phase B+ intake      → architect (decompose + freeze contracts), context-analyzer (map the area)
Phase C implement    → codex-implementer / claude-implementer   (+ specialist if role:* set)
Gate pipeline        → verifier → reviewer → cleanup            (governed by the `gates` config)
Phase 4 deploy       → devops                                    (if a role:devops / deploy issue)
```

- The **gate personas** (verifier, reviewer, cleanup) run per issue before merge; which of them
  run is the `gates` config (`verify,lint,typecheck,review,cleanup`). `review` = verifier +
  reviewer; `cleanup` = the cleanup persona.
- **Specialist implementers** (devops, documentation, dependency) replace or augment the base
  implementer when a `role:*` label is set — e.g. a `role:devops agent:codex` issue is still
  implemented by Codex, but with the devops brief and an emphasis on deploy config + smoke
  checks, and the devops persona owns the Phase 4 deploy for it.

---

## Context discipline (why personas stay cheap)

Every persona subagent is told: do your one job, then return the smallest useful result — a
`pass`/`bounce` verdict with a findings pointer, or `DONE|<scratchpad-path>` — **not** the full
diff or file dumps. The orchestrator keeps only these compact returns, so running ten personas
across a wave costs ten short messages, not ten diffs. This mirrors the source project's
isolated-subagent + scratchpad-return discipline, reimplemented here.

---

## Scope & attribution

The persona *set* and the keyword-routing idea come from
`barkain/claude-code-workflow-orchestration`; the briefs, backings, label scheme, and loop
integration are ours. No prompts or code from that project are used. Personas that don't fit a
GitHub-issue loop (their nudge-enforcer, team-mode chat) are not reproduced — see
[ORCHESTRATION.md](ORCHESTRATION.md#scope--attribution).
