export const meta = {
  name: 'panel',
  description: 'Read-only panel of content-calibrated lenses, with adversarial verification of critical/high findings',
  whenToUse: 'Dispatched by the /adversarial:review skill, which builds the lenses and args. Invoked bare, it reviews nothing and tells the user to run /adversarial:review.',
  phases: [
    { title: 'Review', detail: 'One read-only agent per lens, in parallel' },
    { title: 'Verify', detail: 'An independent skeptic tries to refute each critical/high finding' },
  ],
}

// Static script: do NOT edit it per run. Everything run-specific arrives via `args`
// (Workflow tool input), so content with backticks or ${...} never touches JS source.
//
// args = {
//   language: 'Brazilian Portuguese',    // required: language of every finding
//   paths:    ['/abs/path/plan.md'],     // file targets: lenses Read them in full
//   content:  '...',                     // conversation-only target: VERBATIM text
//   facts:    '- next 15.3 (package.json)\n- ...',  // optional: verified context
//   lenses:   [{ key, question, effort?, model? }],  // 1..6, unique keys
// }
// At least one of `paths` / `content` is required.

const MAX_LENSES = 6
const VERIFY_SEVERITIES = ['critical', 'high']
const EFFORTS = ['low', 'medium', 'high', 'xhigh']

const READ_ONLY = `You are READ-ONLY. You may use Read, Grep, Glob and read-only shell commands (ls, cat, git log, git show, git diff) to check facts. Never use Edit, Write, NotebookEdit, or any command that changes files, git state, packages, or external services. Your output is data for the main reviewer, who alone decides what gets applied.`

const SEVERITY_RUBRIC = `Severity is about consequence if the content is executed as written:
- critical: irreversible harm (data loss or corruption, money lost, security breach, legal or compliance violation), or the deliverable fails its main purpose.
- high: a visible failure in a realistic scenario (wrong behavior, broken flow, silent failure someone depends on), still recoverable; or a factual claim the decision rests on is false.
- medium: a real defect with limited reach (edge case, degraded experience, a gap that will cost rework later).
- low: clarity, consistency, polish. Nothing breaks if left as is.`

const BARE = {
  started: false,
  reason: 'no-args',
  next: 'This workflow was started without args, so nothing was reviewed. Tell the user to run /adversarial:review [path] [--fix], which picks the target, builds the lenses and dispatches this panel. Do not review by hand.',
}

const isBare = raw =>
  raw == null ||
  (typeof raw === 'string' && ['', '{}'].includes(raw.trim())) ||
  (typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0)

// The Workflow tool hands `args` over verbatim. A caller that JSON-encodes the object
// sends a string; parse it here instead of failing and costing a second dispatch.
function normalize(raw) {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Error(`args arrived as a string that is not valid JSON (${e.message}); pass args as a JSON object, not a string`)
  }
}

function validate(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error(`args must be an object {language, paths|content, lenses}; got ${a === undefined ? 'nothing' : Array.isArray(a) ? 'an array' : typeof a}`)
  if (!a.language) throw new Error('args.language is required')
  const hasPaths = Array.isArray(a.paths) && a.paths.length > 0
  const hasContent = typeof a.content === 'string' && a.content.trim() !== ''
  if (!hasPaths && !hasContent) throw new Error('args.paths or args.content is required')
  if (!Array.isArray(a.lenses) || a.lenses.length === 0) throw new Error('args.lenses must have at least 1 lens')
  if (a.lenses.length > MAX_LENSES) throw new Error(`args.lenses has ${a.lenses.length} lenses; merge the most correlated down to ${MAX_LENSES}`)
  const keys = a.lenses.map(l => l && l.key)
  if (keys.some(k => !k)) throw new Error('every lens needs a key')
  if (new Set(keys).size !== keys.length) throw new Error('lens keys must be unique')
  if (a.lenses.some(l => !l.question)) throw new Error('every lens needs a question')
  const badEffort = a.lenses.find(l => l.effort && !EFFORTS.includes(l.effort))
  if (badEffort) throw new Error(`lens ${badEffort.key}: effort must be one of ${EFFORTS.join(', ')}`)
}

if (isBare(args)) return BARE

const input = normalize(args)
validate(input)

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    unread: {
      type: 'array',
      items: { type: 'string' },
      description: 'Target paths you could not read in full (denied, missing, too large). Empty when you read every target.',
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['defect', 'decision'],
            description: 'defect = something is wrong and the fix is clear. decision = a legitimate product/design choice with no single right answer; the user must pick.',
          },
          problem: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          location: { type: 'string', description: 'Section/heading of the content, or file:line' },
          evidence: {
            type: 'string',
            description: 'Exact quote from the content, or file:line of a repo file you actually read, that grounds the finding',
          },
          proposed_fix: {
            type: 'string',
            description: 'Files: a unified diff. Prose: the literal current text, then the literal replacement, each labeled. Never a vague description. For a decision: the options and their consequence.',
          },
          target_span: {
            type: 'string',
            description: 'The exact snippet the fix would replace, copied verbatim from the content (used to detect conflicts between lenses)',
          },
        },
        required: ['kind', 'problem', 'severity', 'location', 'evidence', 'proposed_fix', 'target_span'],
      },
    },
  },
  required: ['unread', 'findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      enum: ['confirmed', 'refuted', 'uncertain'],
      description: 'confirmed only if you checked the evidence yourself and the problem holds',
    },
    reason: { type: 'string', description: 'What you checked and what you found (file:line or quote)' },
    adjusted_severity: {
      type: 'string',
      enum: ['critical', 'high', 'medium', 'low'],
      description: 'Only when the problem is real but the stated severity is wrong',
    },
  },
  required: ['verdict', 'reason'],
}

function targetBlock() {
  const parts = []
  if (input.paths && input.paths.length) {
    const scope = input.content
      ? 'they are context; the review is about the content under review below'
      : 'the review is about them'
    parts.push(`## Target files\n\nRead these in full with the Read tool before answering; ${scope}:\n${input.paths.map(p => `- ${p}`).join('\n')}`)
  }
  if (input.content) {
    parts.push(`## Content under review (verbatim)\n\n${input.content}`)
  }
  if (input.facts) {
    parts.push(`## Verified facts (checked by the main reviewer; re-check any you rely on for a high/critical finding)\n\n${input.facts}`)
  }
  return parts.join('\n\n')
}

function languageRule() {
  return `Write problem, location, reason and any explanation in ${input.language}. evidence and target_span are verbatim copies from the content or the file, never translated. Replacement text inside proposed_fix uses the language, register and terminology of the content under review, not necessarily ${input.language}.`
}

function reviewPrompt(lens) {
  return `You are one lens of an adversarial review panel. Investigate ONLY the question of your lens; other lenses cover the rest.

${READ_ONLY}

${languageRule()}

${targetBlock()}

## Your lens

${lens.question}

## How to report

${SEVERITY_RUBRIC}

- Ground every finding in the evidence field: a verbatim quote from the content, or file:line of a file you read. No evidence, no finding.
- A legitimate choice with no single right answer is kind "decision", not a defect.
- If you could not read a target file in full, list it in unread. Never return an empty findings list to stand for "could not read".
- If you read every target and find no real problem within your lens, return unread: [] and findings: []. Do not fill a quota.`
}

function verifyPrompt(lens, f) {
  return `You are an independent skeptic. Another reviewer (lens "${lens.key}") reported the finding below as ${f.severity}. Try to REFUTE it.

${READ_ONLY}

${languageRule()}

${targetBlock()}

## Finding under verification

- Lens question: ${lens.question}
- Problem: ${f.problem}
- Location: ${f.location}
- Target span: ${f.target_span}
- Evidence cited: ${f.evidence}
- Proposed fix: ${f.proposed_fix}

## What to do

Open the cited evidence yourself (the quote in the content, or the file:line). Then answer:
- refuted: the evidence does not exist, does not say what is claimed, or the problem does not happen as described.
- confirmed: you checked the evidence and the problem holds. If it holds at a different severity, say so in adjusted_severity.
- uncertain: you could not check it (file unreachable, depends on runtime behavior you cannot observe).

${SEVERITY_RUBRIC}`
}

function verifyEffort(lens) {
  return lens.effort === 'high' || lens.effort === 'xhigh' ? lens.effort : 'medium'
}

function needsVerification(f) {
  return f.kind !== 'decision' && VERIFY_SEVERITIES.includes(f.severity)
}

const UNCERTAIN = { verdict: 'uncertain', reason: 'verifier failed or returned nothing' }

phase('Review')
const lensResults = await pipeline(
  input.lenses,
  lens =>
    agent(reviewPrompt(lens), {
      label: lens.key,
      phase: 'Review',
      schema: FINDINGS_SCHEMA,
      effort: lens.effort || 'medium',
      ...(lens.model ? { model: lens.model } : {}),
    }).then(
      r =>
        r && Array.isArray(r.unread) && r.unread.length
          ? { ok: false, error: `could not read: ${r.unread.join(', ')}` }
          : r && Array.isArray(r.findings)
            ? { ok: true, findings: r.findings }
            : { ok: false, error: 'agent returned nothing (skipped or terminal API error)' },
      e => ({ ok: false, error: String((e && e.message) || e) })
    ),
  (stage, lens) => {
    if (!stage.ok) return { lens: lens.key, status: 'failed', error: stage.error, findings: [] }
    const findings = stage.findings
    return parallel(
      findings.map(f => () =>
        needsVerification(f)
          ? agent(verifyPrompt(lens, f), {
              label: `verify:${lens.key}`,
              phase: 'Verify',
              schema: VERDICT_SCHEMA,
              effort: verifyEffort(lens),
            }).then(v => ({ ...f, verification: v || UNCERTAIN }), () => ({ ...f, verification: UNCERTAIN }))
          : Promise.resolve(f)
      )
    ).then(list => ({
      lens: lens.key,
      status: 'ok',
      findings: list.map((f, i) => f || (needsVerification(findings[i]) ? { ...findings[i], verification: UNCERTAIN } : findings[i])),
    }))
  }
)

// A lens that died must stay visible: never let it read as "found nothing".
const results = input.lenses.map((lens, i) =>
  lensResults[i] || { lens: lens.key, status: 'failed', error: 'stage crashed', findings: [] }
)
const failed = results.filter(r => r.status === 'failed').map(r => ({ lens: r.lens, error: r.error }))
const rawCount = results.reduce((n, r) => n + r.findings.length, 0)

if (failed.length) log(`${failed.length} of ${results.length} lenses failed: ${failed.map(f => `${f.lens} (${f.error})`).join(', ')}`)
log(`${rawCount} raw findings from ${results.length - failed.length} lenses`)

return {
  panel: { lenses: results.length, ok: results.length - failed.length, failed },
  raw_count: rawCount,
  results,
}
