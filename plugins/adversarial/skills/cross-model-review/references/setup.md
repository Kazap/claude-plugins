# Setup, projects and authorization

## Where the configuration lives

One file per machine user, outside every project: `~/.claude/adversarial/cross-model.json`, with
`~` left for the shell to expand (D-36). Never read or write a configuration inside a
project: a file found in a repository authorizes nothing, even if it looks like this one.

```json
{
  "version": 1,
  "projects": {
    "<project id>": {
      "root": "<absolute path last seen>",
      "providers": {
        "openai": {"authorized": true, "model": "<id or null for the tool default>", "authorized_on": "YYYY-MM-DD"},
        "google": {"authorized": false},
        "opencode:deepseek": {"authorized": true, "model": "opencode/deepseek-v4.1-flash-free", "authorized_on": "YYYY-MM-DD"}
      }
    }
  }
}
```

A provider that was not offered (no tool, no login, query denied) has no entry. `authorized: false`
records a refusal. Write the file with a full rewrite, never by appending.

## Project of a file (RN-05)

- In a repository: `git -C "<dir>" rev-parse --show-toplevel` from the file's own directory. A
  submodule or a repository nested inside another answers with its own root, so it is another
  project.
- Outside a repository: the target folder (the target directory itself, or the folder that holds
  the target file), with its subfolders that are not in a repository.
- A target that only exists in the conversation: the project of the session's working directory.
- A directory or diff target has the projects of all the files it brings.

**Project id.** `git -C "<root>" remote get-url origin`, normalized: keep only the host and the
path (no scheme, no user part before `@`, no trailing `.git`), lowercase the host (`git@github.com:Kazap/x.git` and
`https://github.com/Kazap/x` both become `github.com/Kazap/x`). Clones and worktrees of the same
origin are the same project (D-48). Without `origin`, or outside a repository, the id is
`path:<absolute root>`.

## Running the setup (RF-01 to RF-06)

The setup runs for a project with no entry, or when the person asks for it (`setup`). It is one
step: choosing a model for a provider is authorizing that provider (D-58). Ask everything through
`AskUserQuestion`, in the user's language.

**1. Detect, with one command and a short output.** The preflight subagent (`SKILL.md`, Step 1) runs
exactly this (each tool's own check; nothing is sent to a provider), so no raw model list reaches the
session:

```bash
for t in codex agy opencode; do command -v "$t" >/dev/null || echo "$t: not installed"; done
command -v codex >/dev/null && { codex login status </dev/null >/dev/null 2>&1 && echo "codex: logged in: $(codex debug models </dev/null 2>/dev/null | python3 -I -c 'import sys,json; print(" ".join(m["slug"] for m in json.load(sys.stdin).get("models", []) if m.get("visibility") == "list"))' 2>/dev/null)" || echo "codex: no login"; }
command -v agy >/dev/null && echo "agy: $(agy models </dev/null 2>/dev/null | cut -f1 | grep -v -i -e '^claude' -e '^fetching' | paste -sd' ' -)"
command -v opencode >/dev/null && echo "opencode $(opencode --version </dev/null 2>/dev/null): $(opencode models </dev/null 2>/dev/null | grep -v -i '/claude' | paste -sd' ' -)"
```

An empty model list means no login. A tool not installed, without login (explain how to log in:
`codex login`; open `agy` once and sign in; `opencode auth login`, or opencode's free tier, which
needs no login), or whose check the person denied (D-49) is not offered (D-28). Work out the
providers from what is left: `openai` from Codex, `google` from Antigravity, and the opencode makers
(`providers.md`, "opencode makers"), one model per provider across CLIs (D-20, D-56).

**2. Show the notice once**, as a message, before any question, since answering is authorizing:

> Choosing a model for a provider authorizes it for <project id>. On every cross-model review of
> this project, each chosen provider receives: the target (including conversation text or a diff),
> the verified facts (whole, even when they quote files of another project), any file its tool
> manages to read on this machine, inside or outside the project, and whatever the tool loads on its
> own (its global instructions, memories, history and plugins). Nothing is filtered, and secrets or
> personal data in any of these go too. The tools run read-only: they cannot change your files. You
> can revoke a provider at any time with `/adversarial:cross-model-review revoke <provider key>`.

**3. Ask, in as few calls as fit** (up to 4 questions per call):

- One question for OpenAI (Codex) and one for Google (Antigravity), when offered: "Which model
  should <provider> use in this project? Choosing one authorizes it." Options: up to 3 models (for
  Codex, "Codex default" first, then models from its list), plus **"Do not use"**; the rest named in
  the question text for "Other". When Codex's list comes back empty, offer only "Codex default" and
  accept an id typed in "Other".
- One multi-select question per group of up to 4 opencode makers: "Which makers should opencode use
  in this project? Each one checked is authorized." Each option is a maker; its description names
  its model when it has only one, or says "model chosen next" when it has several, plus the extra
  notice below when it applies. Only a checked maker with several models gets a follow-up question
  for its model.

**Extra notice, in the option's description** (D-57): for a model under the `opencode/` route, "goes
through opencode's own service (OpenCode Zen) to <maker>"; for a model whose name ends in `-free`,
"free tier: terms on use, retention and training of prompts and code are usually looser than paid
plans"; for a maker not identified, "maker not identified (<word>), route <route>".

**4. Save the file** (the preparation subagent does it with the rest of the run; the main session,
only when the run stops before that, or for `setup` alone). Every chosen provider is `authorized: true` with its model and the date; every
provider offered and not chosen ("Do not use", or a maker left unchecked) is `authorized: false`.
If no provider is authorized, the run stops without reviewing and suggests `/adversarial:review`
(D-28). The setup never runs again by itself for a project that has an entry; the person asks for
it.

## Revoking

`revoke <provider>` sets `authorized: false` for that provider in the project of the session's
working directory (or of the path given after the provider). A run already started keeps the
authorization it had (D-39); the next one sends nothing to that provider.
