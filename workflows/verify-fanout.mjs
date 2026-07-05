export const meta = {
  name: 'codex-loop-verify-fanout',
  description: 'Verify N open Codex PRs in parallel, then adversarially double-check the passes',
  whenToUse: 'When the codex-loop PR queue is deep and you want deterministic parallel verification instead of one-PR-per-tick. Pass args as a list of {issue, pr, acceptance, verify} objects.',
  phases: [
    { title: 'Verify', detail: 'one agent per open PR: checkout, run gates, judge vs acceptance' },
    { title: 'Double-check', detail: 'adversarial re-verify of each PASS before recommending merge' },
  ],
}

// args: [{ issue: 12, pr: 41, acceptance: "…", verify: "npm ci && npm test" }, …]
// Returns: [{ issue, pr, verdict: 'pass'|'bounce', finding }] — the orchestrator does the actual
// merges (Claude stays the sole merger); this workflow only produces verdicts.

const prs = Array.isArray(args) ? args : []
if (!prs.length) return { error: 'no PRs passed in args', verdicts: [] }

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'finding'],
  properties: {
    verdict: { enum: ['pass', 'bounce'] },
    finding: { type: 'string' },
  },
}

const verdicts = await pipeline(
  prs,
  // Stage 1 — verify each PR independently (reviewer persona)
  (p) => agent(
    `You are the codex-loop VERIFIER persona. Verify PR #${p.pr} for issue #${p.issue} in this repo.
Steps: \`gh pr checkout ${p.pr}\`; run the verify command: ${p.verify || 'auto-detect (npm test / pytest)'};
review the diff against the acceptance criteria below; then \`git checkout -\`.
Acceptance criteria:
${p.acceptance || '(see the issue body)'}
Be adversarial — look for a reason it fails. Return only a verdict + one-sentence finding.`,
    { label: `verify:pr-${p.pr}`, phase: 'Verify', schema: VERDICT_SCHEMA },
  ).then((v) => ({ ...p, ...(v || { verdict: 'bounce', finding: 'verifier failed to return' }) })),

  // Stage 2 — adversarial double-check of PASSes only (independent second opinion)
  (r) => {
    if (r.verdict !== 'pass') return r
    return agent(
      `Independently try to REFUTE that PR #${r.pr} (issue #${r.issue}) satisfies its acceptance
criteria. Default to bounce if you find any gap. Acceptance:
${r.acceptance || '(see the issue body)'}
Return a verdict + one-sentence finding.`,
      { label: `double-check:pr-${r.pr}`, phase: 'Double-check', schema: VERDICT_SCHEMA },
    ).then((v2) => ({ ...r, verdict: v2?.verdict === 'pass' ? 'pass' : 'bounce', finding: v2?.finding || r.finding }))
  },
)

const clean = verdicts.filter(Boolean)
return {
  verdicts: clean,
  merge: clean.filter((v) => v.verdict === 'pass').map((v) => ({ issue: v.issue, pr: v.pr })),
  bounce: clean.filter((v) => v.verdict === 'bounce'),
}
