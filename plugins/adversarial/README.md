# Kazap Adversarial Review

A Claude Code plugin with one command, `/adversarial:review [path] [--fix]`. It assembles a panel
of up to 6 read-only reviewers, each with a question calibrated to the content, sends critical and
high findings to an independent skeptic, and only applies fixes with confirmation, or
automatically with `--fix`.

Requires the Workflow tool (multi-agent script orchestration) in Claude Code.

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

## When to use this plugin and when to use another

Fixed-checklist tools give cheap, guaranteed coverage. This plugin trades that for depth
calibrated to the content: it is narrower by design, not exhaustive. Each panel costs a few
minutes and a few hundred thousand subagent tokens. Combine both approaches instead of swapping
one for the other.

- Already implemented code, with the guaranteed correctness and cleanup checklist → `/code-review`
- Cleanup, reuse and simplification only → `/simplify`
- Multi-agent security audit → a dedicated tool, if installed (e.g. `claude-security:scan`)
- Deterministic checks already configured (linter, coverage, scanner) → prefer them
- Design, plan, spec or code where the value lies in reasoning about THIS content → this plugin

## Layout

- `skills/review/` is the `/adversarial:review` skill: `SKILL.md`, `references/` and the behavior
  scenarios in `evals/evals.json`, several taken from real runs.
- `workflows/panel.js` is the `adversarial:panel` workflow the skill dispatches. It is static:
  everything that changes per run comes in through `args`. Invoked bare, it reviews nothing and
  points to `/adversarial:review`.
- Development happens in [Kazap/claude-plugins](https://github.com/Kazap/claude-plugins), under
  `plugins/adversarial/`.
  [Kazap/adversarial-review-plugin](https://github.com/Kazap/adversarial-review-plugin) is a
  mirror of that folder alone, with the plugin at its root; open issues and pull requests in
  Kazap/claude-plugins.
- The workflow's tests live outside this folder, in Kazap/claude-plugins' `tests/adversarial/`, so
  they are not installed: `node tests/adversarial/test-panel-workflow.mjs` from that repository's
  root runs them with simulated agents, no tokens.

## What the plugin runs

- No shell scripts, hooks, MCP servers or network calls, and it reads no credential, token or
  environment variable.
- `workflows/panel.js` is a Claude Code Workflow script, not a shell command. It only calls the
  Workflow runtime's `agent()`, `pipeline()`, `parallel()` and `log()` with the lens questions it
  receives in `args`. Every agent prompt it builds is read-only: agents may use Read, Grep, Glob and
  read-only commands (ls, cat, git log, git show, git diff), and are told never to edit files or
  touch git state, packages or external services. The prompt templates are plain constants in that
  file.
- The skill itself may edit files in your project only to apply fixes you approved, or, with
  `--fix`, the verified ones; it backs up files that are not clean in git first.

## Privacy

The plugin runs entirely in your Claude Code session; Kazap Tecnologia receives no data. See
[PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE) © Kazap Tecnologia
