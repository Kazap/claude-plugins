# Privacy policy: adversarial plugin

Effective date: 2026-10-13. Publisher: Kazap Tecnologia.

This policy covers the `adversarial` Claude Code plugin (`/adversarial:review`). The plugin runs
entirely inside your own Claude Code session. Kazap Tecnologia operates no server for it and
receives, collects or retains none of your data.

## What the plugin reads

- The target you choose: the files or directory you name, a diff, or the text of a design or plan
  from the current conversation.
- Context the review needs: files in your repository that the target relies on, opened read-only,
  and git metadata such as `git status`, `git ls-files`, `git log`, `git show` and `git diff`.

The plugin does not look for personal data. It reads no credentials, tokens, environment
variables or files outside what the review needs, and it uses no connectors or MCP servers.

## Where that content goes

The review is done by Claude subagents dispatched through Claude Code's Workflow tool, in your
session and under your own Claude account. The content they read is processed by Anthropic as
part of that session, under the terms that already apply to your use of Claude Code. The plugin
makes no network calls and sends nothing to any other service, including Kazap Tecnologia.

## What the plugin writes

- Fixes you approve, or, when you run it with `--fix`, the fixes it verified, written to the
  files under review. Fixes outside the target files always ask first.
- Before the first edit, a backup copy of every file about to be edited that is not clean in git,
  saved in your Claude Code session's scratchpad directory on your machine.

It keeps no logs, analytics or telemetry, and stores nothing else.

## Retention

Kazap Tecnologia retains nothing, because it receives nothing. Backup copies stay in your local
scratchpad directory, under your control. Session data held by Anthropic follows Anthropic's own
policies.

## Children

The plugin is a developer tool and is not directed to anyone under 18.

## Changes

Changes to this policy are published in this file, and its history is the git history of
https://github.com/Kazap/claude-plugins.

## Contact

Open an issue at https://github.com/Kazap/claude-plugins/issues.
