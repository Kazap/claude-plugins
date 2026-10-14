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
| [`adversarial`](plugins/adversarial) | `/adversarial:review [path] [--fix]` | Adversarial review panel for a design, plan, spec or code. Read-only lenses calibrated to the content, an independent skeptic for every critical/high finding, and fixes applied only after confirmation or with `--fix`. |

## Development

Each plugin lives in `plugins/<name>/` with its own `.claude-plugin/plugin.json`, which holds its
version. Development tests live in `tests/<name>/`, outside the plugin folders, so they are never
installed. Before publishing a change:

```
claude plugin validate .
node tests/adversarial/test-panel-workflow.mjs
```

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
