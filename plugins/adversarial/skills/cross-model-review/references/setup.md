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

The setup runs for a project with no entry, or when the person asks for it (`setup`). Ask
everything through `AskUserQuestion`, in the user's language.

1. For each CLI in `providers.md`, check that the tool is installed, then the login. Not
   installed → not offered. Installed without login → explain how to log in (`codex login`; open
   `agy` once and sign in; `opencode auth login`, or the free tier, which needs no login) and do
   not offer it (D-28). A denied check → not offered (D-49).
2. Work out the providers: `openai` from Codex, `google` from Antigravity, and the opencode makers
   (`providers.md`, "opencode makers"), one model per provider across CLIs. For opencode, ask first
   which makers to use (multi-select). For each provider, list its models without the Claude family
   and ask which one to use (D-20, D-56). Up to 3 models plus the tool default as options, free ones
   marked; the rest named in the question text for "Other".
3. For each offered provider, show the notice below and ask: authorize / do not authorize.
4. Save the file. If no provider is authorized, the run stops without reviewing and suggests
   `/adversarial:review` (D-28). The setup never runs again by itself for a project that has an
   entry; the person asks for it.

**Notice** (one per provider, rendered in the user's language, as the question text):

> Authorizing <OpenAI through Codex | Google through Antigravity | <maker> through opencode
> (<route>)> for <project id> sends, on every
> cross-model review of this project: the target (including conversation text or a diff), the
> verified facts (whole, even when they quote files of another project), any file the tool manages
> to read on this machine, inside or outside the project, and whatever the tool loads on its own
> (its global instructions, memories, history and plugins). Nothing is filtered, and secrets or
> personal data in any of these go too. The tool runs read-only: it cannot change your files. You
> can revoke this at any time with `/adversarial:cross-model-review revoke <provider key>`.

For an opencode model under the `opencode/` route, add: "The content goes through opencode's own
service (OpenCode Zen) and then to <maker>." For a model whose name ends in `-free`, add: "This is
opencode's free tier: its terms for how prompts and code are used, retained or used for training
are usually looser than those of paid plans." (D-57) For a maker not identified, say so and name
the route instead of a company.

## Revoking

`revoke <provider>` sets `authorized: false` for that provider in the project of the session's
working directory (or of the path given after the provider). A run already started keeps the
authorization it had (D-39); the next one sends nothing to that provider.
