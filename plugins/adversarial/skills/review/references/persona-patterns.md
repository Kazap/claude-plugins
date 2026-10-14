# Lens → effort patterns

Catalog of worked examples (few-shot calibration). When assembling the panel (Phase 2/3), match
the new lens against the closest example below. The examples anchor judgment; they are not a
rigid table by content type.

## Effort

| Signal | Effort |
|---|---|
| Checks one objective property against the text, with a clear binary answer | low |
| Checks facts against a small, closed list; infers undeclared intent; compares two valid readings | medium (default) |
| Chains cause and effect across steps, weighs equally valid trade-offs, or assesses the blast radius of something irreversible (money, data, security) | high |

`xhigh` is rarely worth it: use it only when a high-effort lens on the same content already came back shallow.

## Model

Omit `model`. The session model is the default, and the Workflow guide recommends inheriting it.
Override only with a reason you can state in one line, for example a purely mechanical lens moved
to a cheaper model. "To save tokens" alone is not a reason.

## Writing the lens question

A good question names the concrete fact it tests and tells the lens what to open:

- Weak: "Check deployment risks."
- Strong: "The plan says the Expires field renews on every deploy. Read `.github/workflows/deploy-*.yml` and `Dockerfile.web`: when does the build actually run, and can a production image be older than 180 days?"

## Worked examples by content type

### Design proposal

- "Does this architectural decision conflict with a pattern already established elsewhere in the
  system?" → high (compares against existing conventions and weighs a trade-off).
- "Are the technical claims about the platform/API verifiable against the real documentation?"
  → medium.
- "Does the design have a safety/blast-radius mechanism for the most destructive action it
  allows?" → high.

### Plan / spec

- "Does this step depend, without saying so, on an earlier step that, if it fails, breaks the
  following steps silently?" → high (chained causal reasoning).
- "Are all the listed success criteria observable and testable?" → medium.
- "Does every file the plan lists actually exist at that path?" → low.

### Diff / fresh implementation

- "Does the diff change a behavior that callers outside the diff rely on? Grep the callers of each
  changed function." → high.
- "Does every new branch in the diff have a test that would fail without it?" → medium.

### Mixed (a design in the chat about files in the repo)

Take the vectors from each part, then merge the ones that ask the same question of both:

- "Does the design's claim about the current code (e.g. 'the endpoint already validates the
  token') hold in the files it names?" → medium.
- "If the design ships as written, which existing flow in those files breaks first?" → high.

### Code

- "Does this change introduce a race condition in this specific concurrent section?" → high.
- "Is this name consistent with the convention already used elsewhere in the file?" → low.
- "Would the tests actually fail if the logic broke, or do they only copy the current
  behavior?" → high.
