export const meta = {
  name: 'adversarial-review',
  description: 'Read-only review by content-calibrated lenses, with adversarial verification of critical/high findings',
  phases: [
    { title: 'Review', detail: 'One read-only agent per lens, in parallel' },
    { title: 'Verify', detail: 'An independent skeptic tries to refute each critical/high finding' },
  ],
}

const READ_ONLY = 'You are READ-ONLY. You may use Read, Grep, Glob and read-only shell commands (ls, cat, git log, git show, git diff) to check facts. Never use Edit, Write, NotebookEdit, or any command that changes files, git state, packages, or external services. Your output is data for the main reviewer, who alone decides what gets applied.'

const SEVERITY_RUBRIC = [
  'Severity is about consequence if the content is executed as written:',
  '- critical: irreversible harm (data loss or corruption, money lost, security breach, legal or compliance violation), or the deliverable fails its main purpose.',
  '- high: a visible failure in a realistic scenario (wrong behavior, broken flow, silent failure someone depends on), still recoverable; or a factual claim the decision rests on is false.',
  '- medium: a real defect with limited reach (edge case, degraded experience, a gap that will cost rework later).',
  '- low: clarity, consistency, polish. Nothing breaks if left as is.',
].join('\n')

const LENS_LANGUAGE = 'Write problem, location and any explanation in the review language above. evidence and target_span are verbatim copies from the content or the file, never translated. Replacement text inside proposed_fix uses the language, register and terminology of the content under review, not necessarily the review language.'

const REPORT_RULES = [
  '- Ground every finding in the evidence field: a verbatim quote from the content, or file:line of a file you read. No evidence, no finding.',
  '- A legitimate choice with no single right answer is kind "decision", not a defect.',
  '- If you could not read a target file in full, list it in unread. Never return an empty findings list to stand for "could not read".',
  '- If you read every target and find no real problem within your lens, return unread: [] and findings: []. Do not fill a quota.',
].join('\n')

const SKEPTIC_LANGUAGE = 'Write reason and any explanation in the review language above. Quotes from the content or from a file stay verbatim, never translated.'

const SKEPTIC_RULES = [
  'Open the cited evidence yourself (the quote in the content, or the file:line). Then answer:',
  '- refuted: the evidence does not exist, does not say what is claimed, or the problem does not happen as described.',
  '- confirmed: you checked the evidence and the problem holds. If it holds at a different severity, say so in adjusted_severity.',
  '- uncertain: you could not check it (file unreachable, depends on runtime behavior you cannot observe).',
].join('\n')

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

const FINDING_KEYS = ['kind', 'problem', 'severity', 'location', 'evidence', 'proposed_fix', 'target_span']
const LENS_KEYS = ['key', 'question', 'effort', 'model']
const EFFORTS = ['low', 'medium', 'high', 'xhigh']
const NOTHING = 'agent returned nothing (skipped or terminal API error)'

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonBlank = (v) => typeof v === 'string' && /\S/.test(v)
const isPresent = (v) => v !== undefined && v !== null

// ---- Validation (all before any agent starts) ----

let input = args
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch (e) {
    throw new Error('args: string is not valid JSON')
  }
}
if (!isObject(input)) {
  throw new Error('args: must be an object')
}

const language = input.language
if (!isNonBlank(language)) {
  throw new Error('language: must be a non-blank string')
}

const paths = input.paths
if (isPresent(paths)) {
  if (!Array.isArray(paths)) {
    throw new Error('paths: must be an array of non-blank strings')
  }
  paths.forEach((p, i) => {
    if (!isNonBlank(p)) throw new Error(`paths[${i}]: must be a non-blank string`)
  })
}
const content = input.content
if (isPresent(content) && typeof content !== 'string') {
  throw new Error('content: must be a string')
}

const hasPaths = isPresent(paths) && paths.length > 0
const hasContent = isPresent(content) && isNonBlank(content)
if (!hasPaths && !hasContent) {
  throw new Error('paths/content: at least one target is required (a non-empty paths array or non-blank content)')
}

const facts = input.facts
if (isPresent(facts) && typeof facts !== 'string') {
  throw new Error('facts: must be a string')
}
const hasFacts = isPresent(facts) && isNonBlank(facts)

const lenses = input.lenses
if (!Array.isArray(lenses)) {
  throw new Error('lenses: must be an array of 1 to 6 lens objects')
}
if (lenses.length < 1) {
  throw new Error('lenses: must have at least 1 lens')
}
if (lenses.length > 6) {
  throw new Error(`lenses: got ${lenses.length}, the maximum is 6; merge the most correlated lenses down to 6`)
}

const seenKeys = new Set()
lenses.forEach((lens, i) => {
  if (!isObject(lens)) throw new Error(`lenses[${i}]: must be an object`)
  if (!isNonBlank(lens.key)) throw new Error(`lenses[${i}].key: must be a non-blank string`)
  if (!isNonBlank(lens.question)) throw new Error(`lenses[${i}].question: must be a non-blank string`)
  const extra = Object.keys(lens).filter((k) => !LENS_KEYS.includes(k))
  if (extra.length > 0) {
    throw new Error(`lenses[${i}]: unexpected keys ${JSON.stringify(extra)}; allowed keys are key, question, effort, model`)
  }
  if (seenKeys.has(lens.key)) throw new Error(`lenses[${i}].key: duplicate key ${JSON.stringify(lens.key)}`)
  seenKeys.add(lens.key)
})
lenses.forEach((lens, i) => {
  if (isPresent(lens.effort) && !EFFORTS.includes(lens.effort)) {
    throw new Error(`lenses[${i}].effort: must be one of low, medium, high, xhigh`)
  }
  if (isPresent(lens.model) && !isNonBlank(lens.model)) {
    throw new Error(`lenses[${i}].model: must be a non-blank string`)
  }
})

// ---- Target block (built at runtime from args) ----

const sections = []
if (hasPaths) {
  const intro = hasContent
    ? 'Read these in full with the Read tool before answering; they are context, the review is about the content under review below.'
    : 'Read these in full with the Read tool before answering; the review is about them.'
  sections.push(['## Target files', '', intro, ...paths.map((p) => '- ' + p)].join('\n'))
}
if (hasContent) {
  sections.push(['## Content under review (verbatim)', '', content].join('\n'))
}
if (hasFacts) {
  sections.push(['## Verified facts (checked by the main reviewer; re-check any you rely on for a high/critical finding)', '', facts].join('\n'))
}
const target = sections.join('\n\n')

// ---- Run ----

phase('Review')

const slots = await pipeline(
  lenses,
  async (_prev, lens) => {
    const prompt = [
      'You are one lens of an adversarial review. Investigate ONLY the question of your lens; other lenses cover the rest.',
      '',
      READ_ONLY,
      '',
      'Review language: ' + language,
      '',
      LENS_LANGUAGE,
      '',
      target,
      '',
      '## Your lens',
      '',
      lens.question,
      '',
      '## How to report',
      '',
      SEVERITY_RUBRIC,
      '',
      REPORT_RULES,
    ].join('\n')
    const opts = {
      label: lens.key,
      phase: 'Review',
      schema: FINDINGS_SCHEMA,
      effort: isPresent(lens.effort) ? lens.effort : 'medium',
    }
    if (isPresent(lens.model)) opts.model = lens.model
    let result
    try {
      result = await agent(prompt, opts)
    } catch (err) {
      const msg = isPresent(err) && isNonBlank(err.message) ? err.message : String(err)
      return { ok: false, error: msg }
    }
    if (!isObject(result)) return { ok: false, error: NOTHING }
    const unread = Array.isArray(result.unread) ? result.unread : []
    if (unread.length > 0) return { ok: false, error: 'could not read: ' + unread.join(', ') }
    if (!Array.isArray(result.findings)) return { ok: false, error: NOTHING }
    return { ok: true, findings: result.findings }
  },
  async (outcome, lens) => {
    if (!outcome.ok) {
      return { lens: lens.key, status: 'failed', error: outcome.error, findings: [] }
    }
    const raw = outcome.findings
    raw.forEach((f, i) => {
      if (!isObject(f)) throw new TypeError(`lens ${lens.key}: finding ${i} is not an object`)
    })
    const findings = raw.map((f) => {
      const out = {}
      for (const k of FINDING_KEYS) {
        if (Object.prototype.hasOwnProperty.call(f, k)) out[k] = f[k]
      }
      return out
    })
    const toVerify = []
    raw.forEach((f, i) => {
      if (f.kind !== 'decision' && (f.severity === 'critical' || f.severity === 'high')) toVerify.push(i)
    })
    if (toVerify.length > 0) {
      const skepticEffort = lens.effort === 'high' || lens.effort === 'xhigh' ? lens.effort : 'medium'
      const verdicts = await parallel(toVerify.map((i) => () => {
        const finding = raw[i]
        const prompt = [
          `You are an independent skeptic. Another reviewer (lens "${lens.key}") reported the finding below as ${finding.severity}. Try to REFUTE it.`,
          '',
          READ_ONLY,
          '',
          'Review language: ' + language,
          '',
          SKEPTIC_LANGUAGE,
          '',
          target,
          '',
          '## Finding under verification',
          '',
          '- Lens question: ' + lens.question,
          '- Problem: ' + finding.problem,
          '- Location: ' + finding.location,
          '- Target span: ' + finding.target_span,
          '- Evidence cited: ' + finding.evidence,
          '- Proposed fix: ' + finding.proposed_fix,
          '',
          '## What to do',
          '',
          SKEPTIC_RULES,
          '',
          SEVERITY_RUBRIC,
        ].join('\n')
        return agent(prompt, {
          label: 'verify:' + lens.key,
          phase: 'Verify',
          schema: VERDICT_SCHEMA,
          effort: skepticEffort,
        })
      }))
      toVerify.forEach((i, j) => {
        const v = verdicts[j]
        findings[i].verification = isObject(v) && typeof v.verdict === 'string'
          ? v
          : { verdict: 'uncertain', reason: 'verifier failed or returned nothing' }
      })
    }
    return { lens: lens.key, status: 'ok', findings }
  },
)

// ---- Result ----

const results = lenses.map((lens, i) => {
  const slot = slots[i]
  if (slot === null || slot === undefined) {
    return { lens: lens.key, status: 'failed', error: 'stage crashed', findings: [] }
  }
  return slot
})

const failed = results.filter((r) => r.status === 'failed').map((r) => ({ lens: r.lens, error: r.error }))
const okCount = results.filter((r) => r.status === 'ok').length
const rawCount = results.reduce((n, r) => n + r.findings.length, 0)

if (failed.length > 0) {
  log(`${failed.length} of ${lenses.length} lenses failed: ` + failed.map((f) => `${f.lens} (${f.error})`).join(', '))
}
log(`${rawCount} raw findings from ${okCount} lenses`)

return { review: { lenses: lenses.length, ok: okCount, failed }, raw_count: rawCount, results }
