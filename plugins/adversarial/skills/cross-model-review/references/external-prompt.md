# External reviewer prompt

Every external model gets the same prompt: one general adversarial review of the whole target, with
no lens (D-08), and the same target block and verified facts the Claude lenses get (D-31). Write it
to a file in the scratchpad and pass that file as described in `providers.md`.

Build the prompt by concatenation, never with `String.prototype.replace` or `sed` on run content.
`{SEVERITY_RUBRIC}` and `{REPORT_RULES}` are the fixed texts of the same name in
`../review/references/workflow-spec.md`, copied character for character. `{target}` is built exactly
like that spec's target block (files, content under review, verified facts), from the same values
the Claude panel receives.

```
You are one reviewer in an adversarial review panel. Review the whole target below for real problems; there is no assigned lens, other reviewers cover specific angles.

You are READ-ONLY. You may read files and run read-only commands to check facts. Never create, edit, move or delete files, and never change git state, packages or external services. Your output is data for the main reviewer, who alone decides what gets applied.

Review language: {language}

Write problem, location and any explanation in the review language above. evidence and target_span are verbatim copies from the content or the file, never translated. Replacement text inside proposed_fix uses the language, register and terminology of the content under review, not necessarily the review language.

{target}

## How to report

{SEVERITY_RUBRIC}

{REPORT_RULES}

Answer only with the JSON object the output schema describes.
```

## Verifying an external critical or high finding

The Claude skeptic verifies external critical and high defects (D-04), with the skeptic prompt of
`../review/references/workflow-spec.md` filled as follows: `{lens.key}` is the provider key
(`openai` or `google`), `{lens.question}` is `General adversarial review of the whole target (no
lens)`, and everything else as the spec says. Dispatch one general-purpose `Agent` per finding, all
in one message, with that prompt followed by:

```
Answer only with a JSON object: {"verdict": "confirmed" | "refuted" | "uncertain", "reason": "...", "adjusted_severity": "critical" | "high" | "medium" | "low" (only when it holds at a different severity)}.
```

An agent that fails, or whose answer is not that object, leaves the finding with
`{verdict: "uncertain", reason: "verifier failed or returned nothing"}`, as in the spec.
