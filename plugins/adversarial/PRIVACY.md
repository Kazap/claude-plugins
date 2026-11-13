# Privacy policy: adversarial plugin

Effective date: 2026-11-12. Publisher: Kazap Tecnologia.

This policy covers the `adversarial` Claude Code plugin and its two commands,
`/adversarial:review` and `/adversarial:cross-model-review`. Kazap Tecnologia operates no server
for either and receives, collects or retains none of your data.

**What changed in 3.0.0.** Until version 2.0.0 this policy said, for the whole plugin, that it
makes no network calls and sends nothing to any other service. That still holds for
`/adversarial:review`. Version 3.0.0 adds `/adversarial:cross-model-review`, which sends content
to OpenAI, Google and other model makers reached through opencode, through tools you
install and log into, only after you set it up and authorize each provider for each project.

## /adversarial:review

### What it reads

- The target you choose: the files or directory you name, a diff, or the text of a design or plan
  from the current conversation.
- Context the review needs: files in your repository that the target relies on, opened read-only,
  and git metadata such as `git status`, `git ls-files`, `git log`, `git show` and `git diff`.

It does not look for personal data. It reads no credentials, tokens, environment variables or
files outside what the review needs, and it uses no connectors or MCP servers.

### Where that content goes

The review is done by Claude subagents dispatched through Claude Code's Workflow tool, in your
session and under your own Claude account. The content they read is processed by Anthropic as
part of that session, under the terms that already apply to your use of Claude Code. This command
makes no network calls and sends nothing to any other service, including Kazap Tecnologia.

## /adversarial:cross-model-review

It runs only when you ask for it by name. A plain request for an adversarial review runs
`/adversarial:review`, and no other skill can start this one.

### What it sends, and to whom

For each provider you authorized for the project of the target (OpenAI, through the Codex CLI;
Google, through the Antigravity CLI; other makers such as DeepSeek, Zhipu, MiniMax or NVIDIA,
through opencode), every run sends, under your own account with that provider or through
opencode's own service:

- the target, including conversation text or a diff;
- the verified facts given to the reviewers, whole, even when they quote files of another project;
- any file the external tool manages to read on your machine, inside or outside the project;
- whatever the external tool loads on its own: its global instructions, memories, history and
  plugins.

opencode's free models (names ending in `-free`, under the `opencode/` route) go through
opencode's own service (OpenCode Zen) and then to the model's maker, under the free tier's terms,
which are usually looser about how prompts and code are used, retained or used for training. The
setup notice says so before you authorize one.

The plugin does not filter any of this. Secrets or personal data in any of it are sent too. What
each provider does with it follows your agreement with that provider. The same content also goes
to Anthropic, as with `/adversarial:review`.

### What it reads and runs on your machine

- Whether `codex`, `agy` and `opencode` are installed and logged in (`codex login status`,
  `agy models`, `opencode models`), and their list of models. It does not read the content of their
  credential files.
- The external tools run read-only (`codex exec -s read-only`; `agy` in plan mode, in its sandbox,
  with file writes and commands denied; `opencode` with the plan agent and shell, edits and web
  fetch denied for that run), through your normal Claude Code permission prompts.

### What it stores

`~/.claude/adversarial/cross-model.json`, on your machine and outside every project: for each
project, which providers you authorized or refused, the chosen model and the date. It is never
written inside a project, and a copy found inside a project authorizes nothing. Delete the file,
or run `/adversarial:cross-model-review revoke <provider>`, to stop sending to a provider.

## What both commands write

- Fixes you approve, or, when you run with `--fix`, the fixes it verified, written to the files
  under review. Fixes outside the target files always ask first.
- The review workflow script, which Claude writes from the plugin's specification once per
  session, and, for the cross-model review, the prompt and answer files of the external tools,
  in your Claude Code session's scratchpad directory on your machine. The cross-model files are
  deleted at the end of the run.
- Before the first edit, a backup copy of every file about to be edited that is not clean in git,
  saved in your Claude Code session's scratchpad directory on your machine.

Neither command keeps logs, analytics or telemetry.

## Retention

Kazap Tecnologia retains nothing, because it receives nothing. Backup copies stay in your local
scratchpad directory and the cross-model configuration stays in your home directory, under your
control. Data held by Anthropic, OpenAI, Google, opencode or any other model maker follows their own
policies and your agreements
with them.

## Children

The plugin is a developer tool and is not directed to anyone under 18.

## Changes

Changes to this policy are published in this file, and its history is the git history of
https://github.com/Kazap/claude-plugins.

## Contact

Open an issue at https://github.com/Kazap/claude-plugins/issues.
