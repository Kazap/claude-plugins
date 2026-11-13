# Kazap Adversarial Review

A Claude Code plugin with two commands:

- `/adversarial:review [path] [--fix]` runs up to 6 read-only reviewers in parallel, each with a
  question calibrated to the content, sends critical and high findings to an independent skeptic,
  and only applies fixes with confirmation, or automatically with `--fix`. Nothing leaves your
  Claude Code session.
- `/adversarial:cross-model-review [path] [--fix]` runs the same panel plus one review by each
  model from another family you have access to and authorize: OpenAI through the Codex CLI,
  Google through the Antigravity CLI, and other makers (DeepSeek, Zhipu, MiniMax, NVIDIA and more)
  through opencode, one model per maker. **It sends content to those providers.** It only runs
  when you ask for it by name.

Requires the Workflow tool (multi-agent script orchestration) in Claude Code. The plugin ships no
script: Claude writes the review workflow in your session from a written specification.

## Install

```
/plugin marketplace add Kazap/claude-plugins
/plugin install adversarial@kazap
```

## Usage

```
/adversarial:review docs/plan.md          # review a file, ask before every fix
/adversarial:review app/services/ --fix   # review a directory, auto-apply verified fixes
/adversarial:review                       # review the design or plan in the conversation
```

Reports and questions come in the language of the conversation. Quotes from the target stay
verbatim.

### Cross-model review

```
/adversarial:cross-model-review docs/plan.md   # panel + authorized external models
/adversarial:cross-model-review setup          # (re)do the setup for this project
/adversarial:cross-model-review revoke openai  # stop sending this project to OpenAI
```

The first run in a project runs a setup: it checks which supported CLIs are installed and logged
in, lists their models (never Claude models), and asks you to authorize each provider after
showing what it would receive. Authorization is per person (the machine user) and per project
(the repository of the target, identified by its `origin`), kept in
`~/.claude/adversarial/cross-model.json`, never in the project. Each run says in one line where the
content goes. All permission prompts are answered before anything is sent, external tools run
read-only, a provider that fails or takes more than 10 minutes is reported as failed, and the
report says which reviewer, Claude lens or external model, found each row.

Each external tool keeps its natural behavior: it may read any file it can reach on your machine
and load its own global instructions, memories, history and plugins, and all of that may reach its
provider. The skill does not filter it. opencode's free models (`opencode/*-free`) go through
opencode's own service and its free-tier terms, which the setup notice states. Requires at least
one of the Codex CLI, the Antigravity CLI or opencode, logged in (opencode's free tier needs no
login), besides the Workflow tool. A plain request for an adversarial review always runs
`/adversarial:review`, never this one.

### From another skill

Claude can also start the review on its own, and other skills can call it: tell Claude, in the
calling skill's instructions, to invoke the `adversarial:review` skill with the target path (for
example, "when the document is written, run the `adversarial:review` skill on it"). When it is
called this way, `--fix` only counts if the user typed it in their own command; a flag added by
the calling skill is ignored, and every fix goes through a question. At the end, the review hands
back a summary (applied fixes, open rows, decisions, revert list) instead of asking follow-ups, so
the calling skill can continue.

The calling skill's instructions can also hand the review:

- **required lenses** (`{key, question, effort?, model?}`), included as given;
- **facts** it already verified, and **references** to read for context but not review;
- **settled points**: findings that contest one without a new fact are listed as repeated, not asked;
- a **scope** of passages for a narrow round;
- **hand-back categories**: findings of those kinds are verified but returned to the caller unasked,
  so it can treat them with its own rules.

The caller owns the loop: the review does not offer a second round, and its summary says which
applied fixes changed a rule.

## When to use this plugin and when to use another

Fixed-checklist tools give cheap, guaranteed coverage. This plugin trades that for depth
calibrated to the content: it is narrower by design, not exhaustive. Each review costs a few
minutes and a few hundred thousand subagent tokens. Combine both approaches instead of swapping
one for the other.

- Already implemented code, with the guaranteed correctness and cleanup checklist → `/code-review`
- Cleanup, reuse and simplification only → `/simplify`
- Multi-agent security audit → a dedicated tool, if installed (e.g. `claude-security:scan`)
- Deterministic checks already configured (linter, coverage, scanner) → prefer them
- Design, plan, spec or code where the value lies in reasoning about THIS content → this plugin

## Layout

- `skills/cross-model-review/` is the `/adversarial:cross-model-review` skill. It follows the
  review's procedure and adds the setup, the external providers and their prompt, in `references/`.
- `skills/review/` is the `/adversarial:review` skill: `SKILL.md`, `references/` and the behavior
  scenarios in `evals/evals.json`, several taken from real runs.
- `skills/review/references/workflow-spec.md` specifies the review workflow. A subagent usually writes
  the script from it the first time it is needed in a session (and fixes it if a run fails),
  copying in the fixed agent instructions it quotes and the output schemas in
  `references/schemas/`, so the spec and the script normally stay out of your conversation.
  Everything that changes per run goes through `args`.
- Development happens in [Kazap/claude-plugins](https://github.com/Kazap/claude-plugins), under
  `plugins/adversarial/`.
  [Kazap/adversarial-review-plugin](https://github.com/Kazap/adversarial-review-plugin) is a
  mirror of that folder alone, with the plugin at its root; open issues and pull requests in
  Kazap/claude-plugins.
- Behavior cases for `claude plugin eval` live in Kazap/claude-plugins' `tests/adversarial/evals/`:
  the skill starts from a plain request, and a calling skill can start it without its `--fix` being
  honored. See that repository's README for the command.

## What the plugin runs

- It ships no scripts of any kind, hooks or MCP servers. Every file is Markdown, JSON, the PNG icon
  or the plain-text LICENSE.
- `/adversarial:review` makes no network calls and reads no credential, token or environment
  variable.
- `/adversarial:cross-model-review` runs, through your normal permission prompts, `codex`, `agy`
  and/or `opencode`: to check that they are installed and logged in (`codex login status`,
  `agy models`, `opencode models`), to list models, and to review read-only
  (`codex exec -s read-only`; `agy -p --mode plan --sandbox` with writes and commands denied;
  `opencode run --agent plan` with shell, edits and web fetch denied for that run only). Those tools
  send the content to the providers you authorized, under your own accounts or opencode's free
  tier. It writes `~/.claude/adversarial/cross-model.json` with your choices.
- The review runs through Claude Code's Workflow tool, with a script Claude writes in your session
  from `workflow-spec.md`. The spec allows only the runtime's `agent()`, `pipeline()`, `parallel()`,
  `phase()` and `log()`, one agent per lens plus one skeptic per critical/high defect (decisions
  are not sent to it). Every agent prompt is read-only: agents may use Read, Grep, Glob and
  read-only commands (ls, cat, git log, git show, git diff), and are told never to edit files or
  touch git state, packages or external services.
  The plugin pre-approves no tool, so the Workflow call goes through your normal permission prompt.
- The skill itself may edit files in your project only to apply fixes you approved, or, with
  `--fix`, the verified ones; it backs up files that are not clean in git first.

## Privacy

Kazap Tecnologia receives no data from either command. `/adversarial:review` runs entirely in your
Claude Code session; `/adversarial:cross-model-review` also sends content to the providers you
authorize. See [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE) © Kazap Tecnologia
