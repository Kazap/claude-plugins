---
name: review
description: Adversarial review panel calibrated to a design proposal, plan, spec, or code. Runs up to 6 read-only lenses via Workflow, sends critical/high findings to an independent skeptic, and applies fixes only after confirmation, or automatically with --fix.
argument-hint: "[path] [--fix]"
disable-model-invocation: true
allowed-tools:
  - Workflow(adversarial:panel)
license: MIT
compatibility: Claude Code with the Workflow tool (multi-agent script orchestration). Without it, do not run.
metadata:
  author: Kazap Tecnologia
---

# adversarial:review

## Overview

A panel of read-only review agents whose lenses are derived from the content under review, not from a fixed checklist. The `Workflow` tool runs the lenses in parallel, and an independent skeptic tries to refute every critical or high finding. The main Claude consolidates, verifies the rest, reports, and applies a fix only when authorized.

Without the `Workflow` tool, do not run: there is no fallback with per-agent effort control and schema-validated output.

**Language.** Write every report, question, and status message in the user's language, and pass that language to the lenses as free text in `args.language` (e.g. "Brazilian Portuguese"). Severity and verification labels are translated in the report. Quotes (`evidence`, `target_span`) stay verbatim, and replacement text keeps the language and register of the document under review.

## Core rule — only `--fix` unlocks automatic application

`--fix` in the command that triggered the skill is the ONLY event that authorizes applying fixes without per-item confirmation. Nothing said afterward ("just apply it", "I trust your judgment", "no time right now") substitutes for the flag, even from the user, even in good faith. Without the flag, EVERY application goes through the Phase 6 question, always after the report with the literal fix, even if the user asks to skip it. You may mention that `--fix` exists for future runs; it never applies to the current one.

**Why:** the command with `--fix` and the command without it are two DIFFERENT requests, not two ways of asking for the same thing. Prose documents (plans, specs) have no CI safety net. A misread finding, applied without review, carries the appearance of authority and may be read by others with no one knowing it was never reviewed.

Two corollaries, both absolute:

- **Panel agents never edit.** The read-only clause in the script is fixed, and Phase 0 records a fingerprint of the target so an edit can be caught (Phase 5, step 1).
- **Only approved fixes are applied.** Anything else you want to change (a typo you noticed, a cross-reference) is a new item: show it and ask. Never propose or record a note about the review itself (a "reviewed by N lenses" line, a changelog entry about the review) unless the user asks for it.

**Rationalizations and reality** (drawn from a real pressure test and real runs, see `evals/evals.json`):

| Excuse | Reality |
|---|---|
| "The user said to just apply it, it's a valid instruction from them" | Authority isn't the question. The rule was set by the user themselves, calmly, when they designed this skill. A rushed phrase mid-conversation doesn't rewrite it. |
| "I won't commit, they can see it later with `git diff` / revert it" | Reversibility isn't prior review. Showing the report BEFORE catches the mistake before it's written. |
| "They're in a hurry, the whole table will slow them down" | Hurry is exactly the pressure this rule resists. The more rushed, the higher the cost of an unreviewed mistake. |
| "This isn't disobeying, it's applying senior judgment" | Senior judgment HERE is showing the report before touching any file. |
| "It's a tiny extra correction right next to an approved one" | Approval covers the listed fix, not its neighborhood. Show it as a new item. |

## Every pending decision uses a structured question

Target disambiguation, application choices, conflicts, decisions, re-runs, and the follow-ups after application ("implement now?", "record as an ADR?") all go through `AskUserQuestion`, never as a plain-text question. A paragraph ending in a question mark is easy to skim past, and a one-word reply to it ("1") is easy to over-read.

Tool limits: up to 4 questions per call, 2 to 4 options per question; the tool adds "Other" for free text. More items → more calls. Put the recommended option first and label it. Drop any option that would do nothing different from another one. A batch with a single row becomes a yes/no question. When several questions share a call, order them: conflicts, decisions, rows, backup.

## Procedure

### Phase 0 — Target and context (main Claude only)

Panel agents see only what `args` gives them plus what they read in the repo. They never see this conversation.

1. **Arguments.** `--fix` is a keyword at any position; strip it and evaluate the rest.
2. **Repeated invocation.**
   - Arrived more than once before the panel started → the last one wins. Say in one line which one you followed, with or without `--fix`.
   - Arrived again after a report, for the same target → a new run. If the target's fingerprint (step 8) is unchanged, offer to reuse the consolidated report under the new invocation's flag instead of paying for a new panel (reuse is the recommended option). The earlier pending question is dropped. If reused, show the report again with the rows the new gate would apply automatically.
3. **Resolve the target.**
   - Argument that exists (check with `ls`) → use it.
   - Argument that looks like a path but doesn't exist → say so and ask, offering up to 3 closest matches (Glob) and "none". Never fall back to conversation candidates. "None" ends the run.
   - No argument, or text like "that plan", "the design above" → candidates from the conversation:
     - 1 plausible candidate → use it.
     - Several, forming a sequence where the most recent supersedes the earlier ones (plan and spec reviewed, then implemented) → the most recent.
     - Several with no recency ordering → ask. More than 4 → the 3 most salient plus "none of these".
   - In plan mode, the plan file is usually the target. The panel is read-only, so it can run.
4. **Announce the target** in one line before dispatch: what it is and why it is the one.
5. **How the target reaches the lenses.**
   - File → its absolute path in `args.paths`. Lenses read it in full. Don't paste or summarize.
   - Directory → expand it to files with `git -C <dir> ls-files` (works when the directory is in a different repo than the working directory; prefix each result with `<dir>/` to get absolute paths), or with Glob without generated files when `<dir>` is not in a repo. Pass the absolute paths in `paths`. More than about 30 files → ask to narrow before dispatching.
   - Diff or fresh implementation → the verbatim `git diff <range>` output in `content`, the touched files in `paths`, and the base ref in `facts`.
   - Conversation only → the text VERBATIM in `args.content`. Copy it; never condense, paraphrase, or tidy it. A condensed version is a different document, and the findings would be about your summary. If the text only exists as a base plus amendments across messages, assemble the current version by applying the amendments literally, and say so in the announcement.
   - Mixed (a design in the chat about files in the repo) → `content` for the design, `paths` for the files it touches.
6. **Verified facts** (`args.facts`, optional). Collect the few facts the lenses would otherwise guess and that are not in the target: versions, config, conventions, adjacent code the target relies on. Check each in the source during this session and cite it (`- Next 15.3 (package.json)`). No speculation. Nothing needed → omit.
7. **Language** → `args.language`.
8. **Fingerprint.** Record `shasum -a 256` of every target file, and `git -C <dir> status --porcelain` for the repo that holds each target (`<dir>` = the target's directory; skip it when the target is not in a repo).

### Phase 1 — Classify and list risk vectors

Classify the content: design proposal / plan-spec / code / diff / mixed. Then list the independent risk vectors of THIS content, one line each. For mixed content, take vectors from each part. This list sizes the panel.

### Phase 2 — Assemble the panel

One lens per independent risk vector, at most 6; above that, merge the most correlated. Fewer than 3 genuinely distinct vectors → say why in one line and run with 1 or 2 lenses. Never invent an artificial lens to reach 3.

Each lens is `{key, question}`. The question names a concrete fact about THIS content and tells the lens what to open, never a bare category like "security". Keys and questions may be in the user's language. See `references/persona-patterns.md`.

### Phase 3 — Effort per lens

`medium` by default. The criteria for `low`, `high`, and the rare `xhigh` are in `references/persona-patterns.md`. Omit `model`; set it only with a reason you can state in one line.

### Phase 4 — Dispatch via Workflow

Call `Workflow` with:

- `name`: `"adversarial:panel"`, the workflow this plugin ships in `workflows/panel.js`. Pass no `script` or `scriptPath`. If the tool reports that no workflow has that name (the skill was copied without its plugin), read `workflows/panel.js` from the plugin root, two levels above this skill's base directory, and pass its raw content unchanged as `script` (`cat` gives the raw text, without the line-number prefixes the Read tool adds).
- `args`: `{language, paths?, content?, facts?, lenses: [{key, question, effort?, model?}]}`, passed as a JSON object value. Never wrap it in quotes or `JSON.stringify` it: the tool hands `args` over verbatim, and a string costs a parse step at best. The script parses a string that holds valid JSON, but anything else fails validation.

Never edit the script per run: everything run-specific goes in `args`, so backticks and `${...}` in the content can't break it. The first `Workflow` call per session may ask for permission; that is a runtime gate, not a skill failure. If the user denies it, end the run in one line and do not review on your own. If the call returns an error from `args` validation, fix the `args` (never the script) and call again once. Any other failure → report the error verbatim, say that nothing was reviewed, and offer a re-run via `AskUserQuestion`; never fall back to a review without the panel. Note the duration and total tokens from the completion notification for the report header; if they are missing, leave them out.

The result is `{panel: {lenses, ok, failed: [{lens, error}]}, raw_count, results: [{lens, status, findings}]}`. Each finding has `kind` (`defect`|`decision`), `problem`, `severity`, `location`, `evidence`, `proposed_fix`, `target_span`. Critical/high defects also carry `verification: {verdict: confirmed|refuted|uncertain, reason, adjusted_severity?}`.

### Phase 5 — Consolidate (main Claude, never delegated)

In this order:

1. **Integrity.** Recompute the fingerprint.
   - A target file's hash changed and you made no edit → report it and end the run: no consolidation, no application. Offer a re-run.
   - Changes only outside the target in `git status` → warn in one line and continue. It may be the user's parallel work.
2. **Failed lenses.** Name each one from `panel.failed` with its error exactly as returned. The runtime reports a skipped agent or a terminal API error only as an empty return, so never name a specific cause or code you did not see. Offer to re-run only those, with the same lens definitions. A re-run's findings go through this phase together with the previous ones. A failed lens never counts as "found nothing".
3. **Count from the data.** Every number in the report is counted from the result or from your consolidated list, never estimated.
4. **Verify.**
   - Critical/high defects use the skeptic's verdict. `refuted` leaves the table and goes to "Refuted" with its reason. `adjusted_severity` replaces the original, and the report says so. `uncertain` stays, marked unverified.
   - Medium/low whose fix depends on a claim about a file or external behavior: open the evidence yourself (read the file:line, grep the quote). Doesn't hold → refuted. Can't check → unverified.
   - Medium/low about wording or internal consistency: confirm the quote exists in the target AND that the problem holds when you read the passage in context.
   - Decisions don't go to the skeptic. Confirm the quote exists and that the choice is real; a decision whose premise doesn't hold is refuted.
   - A lens that returned only a description of the fix: write the literal text yourself and mark the row "fix written by me".
5. **Dedupe or conflict.** Two findings at the same location with the same root cause (semantic judgment, not string match):
   - Compatible fixes (same effect, or one contains the other) → merge into one row, keeping the most complete fix and every agreeing lens. The row keeps the HIGHEST verified severity for the report; lowering it requires a one-line reason. For the gate, the row inherits the verification of the finding whose fix was kept (if that one is unverified, the row is unverified), and "Lenses" counts only the lenses whose own fix has the same effect as the kept one; a lens whose fix is only contained in it does not count toward line 7. If the kept fix comes from a medium/low finding, line 6 does not apply to it even when a merged sibling was critical/high.
   - Incompatible fixes → a conflict (step 7), never a merge. Deleting a passage and rewriting the same passage are incompatible.
   - "Lenses" on a row counts only the lenses that agree on the fix, not just on the problem.
6. **Decisions.** `kind: decision`, or a finding whose fix offers alternatives, goes to "Decisions" with its own number (D1, D2…), outside the table. Decisions are never auto-applied and never covered by a bulk option.
7. **Conflicts.** Two fixes that cannot both be applied as written, whether on the same `target_span` or not (incompatible rules in different paragraphs count). This includes a row whose fix touches the passage of a decision, or presupposes one of its options. Both rows stay in the table, marked as in conflict (or as "depends on D<n>"), and leave any automatic set until the user answers. You may offer a reconciling option you write yourself, labeled as yours. Alternatives inside a single finding are a decision, not a conflict.
8. **Empty.** No row and no decision left, and every lens ran → the all-clear line in the user's language ("Panel of N lenses found no problems"), plus the header and the "Refuted" list if any, and skip the rest of Phase 6. If any lens failed, never emit the all-clear line.

### Phase 6 — Report, questions, application

**Read `references/report-format.md` before writing the report.** It holds the layout and the question shapes.

**The gate.** For each table row, the first matching line decides. "Verified" means two things: the problem was confirmed by the skeptic (even with an adjusted severity) or by your own step-4 check, AND you checked the fix itself against the target: its "before" text is the `target_span` (or contains it) at the stated location, the replacement resolves the problem, and it changes nothing beyond that span. A row whose problem holds but whose fix fails this check is "unverified" (line 5). Severity means the final severity.

| # | Row | Action |
|---|---|---|
| 1 | Refuted | never apply; listed under "Refuted" |
| 2 | In a conflict | ask |
| 3 | Fix edits any file outside the target files (read the files the fix touches, not just its Location). For a mixed target, only the conversation content counts as target; the files in `paths` are context | ask |
| 4 | Fix written by me | ask |
| 5 | Unverified | ask |
| 6 | Verified, critical or high | with `--fix`: apply. Without: ask |
| 7 | Verified, 2+ lenses agree on the fix | with `--fix`: apply. Without: ask |
| 8 | Anything else (1 lens, medium/low) | ask |

Decisions (step 6) are always asked.

**Application rules** (the only copy; `references/report-format.md` points here):

1. **Questions first, then one pass.** Show the full report, including the rows that will be applied automatically. Ask every pending question. Then apply the automatic and approved fixes together, in order of position in each file.
2. **Directory target with `--fix`** → after the report and before the first edit, one extra question listing the files the automatic set would touch. Options: apply / treat as without `--fix` / apply nothing.
3. **Backups.** Right before the first edit (after every answer is in), recompute `shasum -a 256` and `git status --porcelain` for every file about to be edited. A target file whose hash changed since Phase 5 step 1 → stop as in the integrity check. Every file about to be edited, target or not, that is not tracked-and-clean in git AT THAT MOMENT (uncommitted changes, untracked, or outside a repo, like a plan file) gets a copy in the scratchpad before the first edit. A file with uncommitted changes also needs a question first: "Apply on top, with a backup (Recommended)" / "Stop". Never commit, stash, or switch branches to get a clean tree: the user decides when and where to commit, and many repos forbid commits on the default branch.
4. **Exactly the approved fixes.** Before each replacement, the old text must occur exactly once. Zero occurrences → don't apply; report "text no longer found" and ask. Two or more → widen the snippet until it is unique; if impossible, ask. After each replacement, confirm the old text is gone and the new text is present.
5. **Conversation-only target** → there is no file. After the answers, show the revised version with exactly the approved items.
6. **Plan mode** → edit only the plan file (the scratchpad backup is allowed). Close as in rule 7, then call `ExitPlanMode` again.
7. **Close.** List the touched files and how to revert each: `git checkout -- <file>` when it was tracked and clean, otherwise its backup path. Follow-ups go through `AskUserQuestion`.
8. **Second round.** If an applied fix from a critical/high row, a decision, or a conflict changed behavior or a rule (not just wording), offer a narrower round: the changed passages in `content`, the file in `paths`, and each lens question starting with "Only in the passages under 'Content under review' above; read the file only for context". Never run it automatically.

## Additional Resources

- **`references/report-format.md`** — report layout and question shapes (required in Phase 6)
- **`references/persona-patterns.md`** — effort criteria and worked lens examples by content type
- **`evals/evals.json`** — evaluation scenarios
- Plugin root (two levels above this skill): **`workflows/panel.js`** is the static panel workflow (everything run-specific goes in `args`); **`README.md`** is for humans: when to use this skill versus other review tools
