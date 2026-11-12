# Kazap Claude Code plugins

A [Claude Code](https://code.claude.com) plugin marketplace published by Kazap Tecnologia.

## Install

```
/plugin marketplace add Kazap/claude-plugins
/plugin install adversarial@kazap
```

## Plugins

| Plugin | Commands | What it does |
|---|---|---|
| [`adversarial`](plugins/adversarial) | `/adversarial:review [path] [--fix]`<br>`/adversarial:cross-model-review [path] [--fix]` | Adversarial review of a design, plan, spec or code. Up to 6 read-only lenses calibrated to the content, an independent skeptic for every critical/high defect, and fixes applied only after confirmation or with `--fix`. The cross-model command adds OpenAI (Codex CLI) and Google (Antigravity CLI) models you authorize, and sends content to them. |

### adversarial

- `/adversarial:review` runs a panel of read-only Claude lenses through Claude Code's Workflow
  tool. Nothing leaves your Claude Code session.
- `/adversarial:cross-model-review` runs the same panel plus one general review by each external
  model you authorize, at most one OpenAI model through the Codex CLI and one Google model through
  the Antigravity CLI, and merges everything into one report that says who found each row. **It
  sends the target, the verified facts and whatever each tool reads or loads on its own (any file
  it reaches, its global instructions, memories, history and plugins) to those providers, under
  your own accounts.** It only runs when you ask for it by name; a plain request for an
  adversarial review runs `/adversarial:review`.
  - Requires the Codex CLI and/or the Antigravity CLI installed and logged in, besides the
    Workflow tool.
  - The first run in a project runs a setup: it detects the tools, lists their models (never
    Claude models) and asks you to authorize each provider for that project.
    `/adversarial:cross-model-review setup` redoes it, and
    `/adversarial:cross-model-review revoke <openai|google>` stops sending to a provider. Choices
    are kept per machine user in `~/.claude/adversarial/cross-model.json`, never in the project.
  - External tools run read-only, after every permission prompt of the run is answered, and a
    provider that fails or takes more than 10 minutes is reported as failed.

See the plugin's [README](plugins/adversarial/README.md) and
[PRIVACY.md](plugins/adversarial/PRIVACY.md) for the details.

## Development

Each plugin lives in `plugins/<name>/` with its own `.claude-plugin/plugin.json`, which holds its
version. Development tests live in `tests/<name>/`, outside the plugin folders, so they are never
installed. Before publishing a change:

```
claude plugin validate .
node tests/adversarial/test-workflow-spec.mjs
```

`adversarial` ships no script: Claude writes its review workflow in each session from
`plugins/adversarial/skills/review/references/workflow-spec.md`. The test runs a script written
from that spec, `tests/adversarial/reference-workflow.js` by default, with simulated agents and
checks it against the spec and the schemas. After changing the spec, have Claude write a new
script from it and pass its path to the test.

Behavior evals run real models, so they cost tokens (about US$ 0.10 per run for `adversarial`).
Run them from the repository root, so the cases can load the plugin from `plugins/`:

```
claude plugin eval . --eval-dir tests/adversarial/evals --ablation none --scaffold --allow-tools Edit Write
```

`cross-model-review` follows the review's spec and procedure, so the workflow test above covers
its Claude panel. Its own evals (`cross-model-trigger-by-name`, and the `not-cross-model` grader of
`natural-language-trigger`) check only when it starts; they keep Bash and Workflow out of reach, so
nothing is sent to OpenAI or Google. An end-to-end check calls the real CLIs and sends content to
those providers: run it by hand on a throwaway repository with fictitious content, never on real
code. The Codex and Antigravity flags in
`plugins/adversarial/skills/cross-model-review/references/providers.md` were checked against
`codex-cli` 0.167.1 and the Antigravity CLI on 2026-11-12; recheck them when either tool updates.

The Claude plugin directory lists each plugin from a mirror repository that holds only that
plugin's folder, at its root. A plugin in a subfolder has every version held for a reviewer when
it ships scripts the validator can't follow, such as a Workflow script, and moving the plugins to
this repository's root would install the tests with them. After pushing `main`, update the mirror:

```
git subtree push --prefix plugins/adversarial https://github.com/Kazap/adversarial-review-plugin.git main
```

Mirrors receive no direct commits. Plugin users still install from this marketplace.

Plugin icons are square PNGs at `plugins/<name>/.claude-plugin/icon.png`; their SVG sources live in
`design/`, outside the plugin folders.

All content in this repository is written in English.

## License

[MIT](LICENSE) © Kazap Tecnologia
