# Review workflow specification

This file specifies the review workflow; you write the workflow script from it, in your session. This
file is the contract: the script does what it says, nothing more.

## Before writing

Load the workflow-authoring skill for the Workflow script API. Write the script to the file path
you were told to; when writing it for someone else, do not call `Workflow` and do not run the
script. This file and the two schemas are all you need: how the script is dispatched, reused or
retried is the caller's job.

## Inputs (`args`)

The script reads everything run-specific from `args`, passed as a JSON object value.

| Field | Required | What it holds |
|---|---|---|
| `language` | yes | Review language as free text, e.g. "Brazilian Portuguese" |
| `paths` | one of `paths`/`content` | Absolute paths of the target files |
| `content` | one of `paths`/`content` | The conversation-only target, verbatim |
| `facts` | no | Verified facts as a markdown list |
| `lenses` | yes | 1 to 6 items `{key, question, effort?, model?}` |

"Non-blank string" below means a string with at least one non-whitespace character. "Object"
means a non-null object that is not an array, everywhere in this file. A field is "absent" when it
is undefined or null, and "present" otherwise. Values are compared exactly: no trimming or
case-folding of keys, `kind`, `severity` or `effort`.

## Validation

Before any agent starts, check the following in order and throw an `Error` whose message names
the field and what was wrong (the wording is yours):

1. If `args` is a string, parse it as JSON; a string that is not valid JSON throws, with "JSON"
   in the message. The parsed value, or `args` itself, must be an object.
2. `language` is a non-blank string.
3. `paths`, when present, is an array of non-blank strings (it may be empty). `content`, when
   present, is a string.
4. At least one target: `paths` has at least one item, or `content` is non-blank.
5. `facts`, when present, is a string.
6. `lenses` is an array of 1 to 6 items. Above 6, the message says to merge the most correlated
   lenses down to 6.
7. Every lens is an object whose `key` and `question` are non-blank strings, with no keys other than
   `key`, `question`, `effort` and `model`, and keys are unique.
8. `effort`, when present, is one of `low`, `medium`, `high`, `xhigh`. `model`, when present, is a
   non-blank string.

In the prompts, a target section appears only when its value has substance: `paths` with at
least one item, `content` and `facts` non-blank.

## Header

`meta` is a pure literal:

- `name`: `adversarial-review`
- `description`: `Read-only review by content-calibrated lenses, with adversarial verification of critical/high findings`
- `phases`: `Review` (detail: `One read-only agent per lens, in parallel`) and `Verify` (detail:
  `An independent skeptic tries to refute each critical/high finding`).

## Fixed text

The fixed texts and schemas below, the prompt templates, the error strings under Run and Result,
and the log lines are all quoted in this file; copy each exactly into the source, never reworded,
shortened or translated. Write READ_ONLY as one string literal on a single source line, and
keep the words `agentType`, `isolation`, `permission`, `tools` and `cwd` out of the source,
comments included: the caller checks the source by grep before dispatch. Only validation messages
are yours. The agents read no file of this plugin: everything they need is in their prompt.

**READ_ONLY**

```
You are READ-ONLY. You may use Read, Grep, Glob and read-only shell commands (ls, cat, git log, git show, git diff) to check facts. Never use Edit, Write, NotebookEdit, or any command that changes files, git state, packages, or external services. Your output is data for the main reviewer, who alone decides what gets applied.
```

Write READ_ONLY once, as a constant named `READ_ONLY`, and put it in the lens prompt and in the
skeptic prompt by that name, never under another one. Write the name on exactly three source
lines: its definition, and one line in each prompt's own expression; never in a comment, a log or
a helper: the caller counts the name by grep and expects exactly 3.

**SEVERITY_RUBRIC**

```
Severity is about consequence if the content is executed as written:
- critical: irreversible harm (data loss or corruption, money lost, security breach, legal or compliance violation), or the deliverable fails its main purpose.
- high: a visible failure in a realistic scenario (wrong behavior, broken flow, silent failure someone depends on), still recoverable; or a factual claim the decision rests on is false.
- medium: a real defect with limited reach (edge case, degraded experience, a gap that will cost rework later).
- low: clarity, consistency, polish. Nothing breaks if left as is.
```

**LENS_LANGUAGE**

```
Write problem, location and any explanation in the review language above. evidence and target_span are verbatim copies from the content or the file, never translated. Replacement text inside proposed_fix uses the language, register and terminology of the content under review, not necessarily the review language.
```

**REPORT_RULES**

```
- Ground every finding in the evidence field: a verbatim quote from the content, or file:line of a file you read. No evidence, no finding.
- A legitimate choice with no single right answer is kind "decision", not a defect.
- If you could not read a target file in full, list it in unread. Never return an empty findings list to stand for "could not read".
- If you read every target and find no real problem within your lens, return unread: [] and findings: []. Do not fill a quota.
```

**SKEPTIC_LANGUAGE**

```
Write reason and any explanation in the review language above. Quotes from the content or from a file stay verbatim, never translated.
```

**SKEPTIC_RULES**

```
Open the cited evidence yourself (the quote in the content, or the file:line). Then answer:
- refuted: the evidence does not exist, does not say what is claimed, or the problem does not happen as described.
- confirmed: you checked the evidence and the problem holds. If it holds at a different severity, say so in adjusted_severity.
- uncertain: you could not check it (file unreachable, depends on runtime behavior you cannot observe).
```

**Schemas.** FINDINGS_SCHEMA and VERDICT_SCHEMA are the objects in `schemas/findings.json` and
`schemas/verdict.json`, next to this file. Read both while writing the script and write each into
the source as an object literal, with every key, `enum`, `required` list and
`description` unchanged.

## Prompts

The templates below are the exact prompt text. `{name}` marks a value inserted at runtime, or one
of the fixed texts above by its name; everything else is literal, including the blank lines.
Insert values as they are, even when they span several lines. Build the prompt by concatenation
or template literals at runtime; never call
`String.prototype.replace` with run content as the replacement (`$&` or `$1` in the content would
be expanded).

**Target block** (`{target}` below). Up to three sections, in this order, each only when its
value has substance (as defined under Validation), separated by one blank line:

```
## Target files

{files intro}
- {path}
```

with one `- {path}` line per path. `{files intro}` is `Read these in full with the Read tool before answering; they are context, the review is about the content under review below.` when the content section appears, otherwise `Read these in full with the Read tool before answering; the review is about them.`

```
## Content under review (verbatim)

{content}
```

```
## Verified facts (checked by the main reviewer; re-check any you rely on for a high/critical finding)

{facts}
```

**Lens prompt:**

```
You are one lens of an adversarial review. Investigate ONLY the question of your lens; other lenses cover the rest.

{READ_ONLY}

Review language: {language}

{LENS_LANGUAGE}

{target}

## Your lens

{lens.question}

## How to report

{SEVERITY_RUBRIC}

{REPORT_RULES}
```

**Skeptic prompt:**

```
You are an independent skeptic. Another reviewer (lens "{lens.key}") reported the finding below as {finding.severity}. Try to REFUTE it.

{READ_ONLY}

Review language: {language}

{SKEPTIC_LANGUAGE}

{target}

## Finding under verification

- Lens question: {lens.question}
- Problem: {finding.problem}
- Location: {finding.location}
- Target span: {finding.target_span}
- Evidence cited: {finding.evidence}
- Proposed fix: {finding.proposed_fix}

## What to do

{SKEPTIC_RULES}

{SEVERITY_RUBRIC}
```

## Run

Call `phase('Review')` once and never call `phase('Verify')`: skeptics are grouped by their
`phase` option, so lenses verifying at different times do not race. Then run every lens with one
`pipeline` over the validated `lenses` (from the parsed object when `args` arrived as a string)
with two stages, so each lens's verification starts as soon as its own review ends, with no
barrier between lenses. In both stages, take the lens from the callback's second argument (the
original item), not from the first.

**Stage 1, review.** One agent with the lens prompt and these options: `label` = the lens key;
`phase` = `Review`; `schema` = FINDINGS_SCHEMA; `effort` = the lens effort, or `medium` when
absent; `model` only when the lens sets one (otherwise the option is absent, not undefined).
Catch a throw from this agent inside the stage, so it never reaches the pipeline. The outcome,
first match wins:

1. The agent threw → failed, error = the error's `message` when it is a non-blank string, otherwise `String(error)`.
2. The result is not an object → failed, error
   `agent returned nothing (skipped or terminal API error)`.
3. `unread` is a non-empty array → failed, error `could not read: ` followed by its items joined
   by `, `. A missing `unread`, or one that is not an array, counts as empty.
4. `findings` is not an array → failed, error
   `agent returned nothing (skipped or terminal API error)`.
5. Otherwise → ok, with its `findings`.

**Stage 2, verify.** A failed lens skips verification and ends as
`{lens: key, status: 'failed', error, findings: []}`. For an ok lens, first throw a `TypeError`
if any finding is not an object (it becomes "stage crashed", below). Then every finding whose
`kind` is not `decision` and whose `severity` is `critical` or `high` gets one skeptic agent; this
lens's skeptics run together in one `parallel` call (skip the call when none qualify). The finding
fields the skeptic prompt uses are required strings in FINDINGS_SCHEMA; insert them as they
are. Options: `label` = `verify:` followed by the lens key; `phase` = `Verify`; `schema` =
VERDICT_SCHEMA; `effort` = the lens effort when it is `high` or `xhigh`, otherwise `medium`; no
`model`.

Each output finding is a new object holding only the FINDINGS_SCHEMA properties (`kind`,
`problem`, `severity`, `location`, `evidence`, `proposed_fix`, `target_span`) the agent's finding
has; anything else the agent added is dropped, so a `verification` field only ever comes from a
skeptic. A verified finding also gets `verification` = the skeptic's result. When the skeptic
throws, returns something that is not an object, returns an object without a string `verdict`,
or its slot comes back null from `parallel`, `verification` is
`{verdict: 'uncertain', reason: 'verifier failed or returned nothing'}`. The lens ends as
`{lens: key, status: 'ok', findings}`, findings in their original order.

Any other error inside a lens's stages, including that `TypeError`, is not caught there: the
pipeline turns it into a null slot, handled below. The other lenses go on either way.

## Result

- A lens whose `pipeline` slot is null ends as `{lens: key, status: 'failed', error: 'stage crashed', findings: []}`. A lens that died never reads as "found nothing".
- `results` has one entry per lens, in the order of the validated `lenses`. `failed` lists `{lens, error}`
  for every failed lens, "stage crashed" included, in the same order.
- When any lens failed, `log` the line `{n} of {total} lenses failed: ` followed by `{key} ({error})` items joined by `, `. Always `log` the line `{raw} raw findings from {ok} lenses`. No singular forms.
- Return `{review: {lenses, ok, failed}, raw_count, results}`: `lenses` is the lens count, `ok` the
  count of ok lenses, `failed` the list above, `raw_count` the total of findings across all results.

## Invariants

- No text from the target, the facts, a lens or a finding is ever written into the source. It
  reaches the agents only through `args`, read at runtime, so backticks and `${...}` in the
  content cannot break the script.
- No agents beyond one per lens and one per critical/high defect. Each `agent()` call gets exactly
  the options listed under Run, no others: no tool list, permission, agent type or working
  directory option. The script calls only `agent`, `pipeline`, `parallel`, `phase` and `log`, and
  has no file access of its own.

## Self-check before calling `Workflow`

- [ ] `meta` is a pure literal with the name, description and phases above.
- [ ] Every validation rule throws before the first agent starts.
- [ ] The fixed texts and the prompt templates match this file character for character.
- [ ] READ_ONLY is interpolated in both the lens prompt and the skeptic prompt, right after their first line, and each `agent()` call passes only the options listed under Run.
- [ ] FINDINGS_SCHEMA and VERDICT_SCHEMA match the JSON files, including both `required` lists.
- [ ] No literal from the run content appears in the source, and no `replace` takes it as the replacement.
- [ ] A throwing review agent is caught inside its stage; every failure path yields the stated error; every lens appears in `results`. Trace by hand: a review agent that throws, returns null, returns `{unread: ['x'], findings: []}`, or returns `{unread: []}` without `findings` each ends with `status: 'failed'`, never `ok` with empty findings.
- [ ] Each output finding holds only the FINDINGS_SCHEMA properties, plus `verification` from a skeptic.
