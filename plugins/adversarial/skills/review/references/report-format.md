# Report format and question shapes

Everything below is written in the user's language. The labels here are examples in English; translate them. The application rules live only in SKILL.md, Phase 6.

## 1. Header (one line)

```
Panel: 4 lenses (1 failed: delivery-path, returned nothing) · 20 raw findings, 14 rows, 2 decisions, 2 refuted · 2 min 43 s · 268k tokens
```

Every number is counted from the workflow result or your consolidated list. Duration and tokens come from the completion notification; leave them out if it doesn't carry them.

## 2. Table

| # | Severity | Problem | Location | Lenses | Verification |
|---|---|---|---|---|---|
| 1 | high | One sentence. | §5.5, "Confirmation" | 2 | confirmed |
| 2 | medium | One sentence. | `lib/x.ts:42` | 1 | checked by me |
| 3 | medium | One sentence. | §7.2 | 3 | confirmed (was high) |
| 4 | medium | One sentence. | §3 | 1 | checked by me · conflicts with #5 |
| 5 | low | One sentence. | §5 | 1 | unverified · conflicts with #4 |

- Sorted critical → low. Short cells. Decisions are not in the table.
- No diff inside the table: a markdown cell can't hold a multi-line diff.
- Verification values: `confirmed` (skeptic), `confirmed (was <severity>)`, `checked by me`, `unverified`, plus `fix written by me`, `outside the target`, and `conflicts with #n` when they apply.
- A merged row whose severity went DOWN carries the reason in its fix block.
- A heading quoted in Location stays verbatim, like any quote.

## 3. Fixes (below the table, one block per row, same #)

For files, a fenced unified diff:

````
**#2** · `lib/x.ts:42`
```diff
- const ttl = 60
+ const ttl = 60 * 60
```
````

For prose, the literal text before and after, in the document's own language:

```
**#1** · §5.5, "Confirmation"
Before:
> - Local check before querying. UUID format, existing charge, not yet closed.
After:
> - Local check before querying. UUID format and existing charge. A refund notice arrives on a closed charge by design, so "not yet closed" does not apply to it.
```

Never a description of the change ("tighten the wording of §5.5").

## 4. Decisions, conflicts, refuted

- **Decisions:** `D1`, `D2`… One line each with the question and the options, recommended first.
- **Conflicts:** which rows, and what each fix would leave in place. A reconciling option you wrote is labeled as yours.
- **Refuted:** one line each: the problem, who refuted it, and why.

## 5. Questions

**Application question, without `--fix`:**

| Option | Meaning |
|---|---|
| All verified (Recommended) | every row whose verification is not `unverified`, `fix written by me`, `outside the target`, or in conflict |
| Critical and high only | same filter, critical/high rows only |
| Pick item by item | follow-up calls: batches of up to 4 rows per multiSelect question |
| None | nothing is applied |

Its description says which rows only enter through "Pick item by item". Drop "All verified" or "Critical and high only" when it would select nothing or the same set as the other.

Conflicts, decisions, and the backup question for files with uncommitted changes are separate questions; put them in the same call while they fit.

Why not severity buckets as the main choice: in the real runs the user selected every bucket every time, and the only rejection came from a separate decision question. The real choices are decisions and conflicts, so they get their own questions.

**With `--fix`:** the same application question, restricted to the rows the gate sends to a question: "All verified (Recommended)" / "Pick item by item" / "None", with the same filter and the same drop rule. Rows the gate applies automatically are not in it. Decisions, conflicts, and the backup question stay separate.

**Recommended options for the other questions:**

| Question | Recommended |
|---|---|
| Re-run failed lenses | Re-run |
| Re-run after the integrity stop | Re-run |
| Reuse the report after a new invocation | Reuse |
| File with uncommitted changes | Apply on top, with a backup |
| Conflict | your reconciling option when one exists; otherwise the side with the higher verified severity; on a tie, no recommendation |
| Second round | no default; say what changed and let the user pick |

## 6. Special outcomes

- **All clear:** header line, then `Panel of 4 lenses found no problems.`, then the "Refuted" list if any.
- **A lens failed:** header line, then `delivery-path did not run (returned nothing: skipped or API error), so that risk is unreviewed.`, then whatever the other lenses produced (table, decisions, refuted), then the re-run question. Never the all-clear line.
- **Run stopped by the integrity check:** header line, what changed (file and hash), that nothing was consolidated or applied, and the re-run question.
