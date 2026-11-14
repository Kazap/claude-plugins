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
command -v codex >/dev/null && if codex login status </dev/null >/dev/null 2>&1; then echo "codex: logged in"; codex debug models </dev/null 2>/dev/null | python3 -I -c 'import sys,json; [print("codex model:", m["slug"], "|", m.get("description") or "") for m in json.load(sys.stdin).get("models", []) if m.get("visibility") == "list"]' 2>/dev/null; else echo "codex: no login"; fi
command -v agy >/dev/null && { echo "agy: installed"; agy models </dev/null 2>/dev/null | awk -F'\t' 'tolower($1) !~ /^(claude|fetching)/ && tolower($2) !~ /^claude/ {print "agy model: " $1 " | " $2}'; }
command -v opencode >/dev/null && echo "opencode $(opencode --version </dev/null 2>/dev/null): $(opencode models </dev/null 2>/dev/null | grep -v -i '/claude' | paste -sd' ' -)"
```

Each `codex model:` and `agy model:` line is `<id> | <about>`: Codex's own description of the model, or Antigravity's display name. An empty model list means no login. A tool not installed, without login (explain how to log in:
`codex login`; open `agy` once and sign in; `opencode auth login`, or opencode's free tier, which
needs no login), or whose check the person denied (D-49) is not offered (D-28). Work out the
providers from what is left: `openai` from Codex, `google` from Antigravity, and the opencode makers
(`providers.md`, "opencode makers"), one model per provider across CLIs (D-20, D-56).

**2. Show the notice once**, before any question, since answering is authorizing. It is the consent
text: write it as its own message, right before the first question, with the full text below as a
quote block, translated into the user's language and otherwise word for word. Never paraphrase it,
shorten it, merge it with other text or turn it into a progress, status or summary line, also when
`setup` runs again for a project that already has an entry.

> Choosing a model for a provider authorizes it for <project id>. On every cross-model review of
> this project, each chosen provider receives: the target (including conversation text or a diff),
> the verified facts (whole, even when they quote files of another project), any file its tool
> manages to read on this machine, inside or outside the project, and whatever the tool loads on its
> own (its global instructions, memories, history and plugins). Nothing is filtered, and secrets or
> personal data in any of these go too. The tools run read-only: they cannot change your files. You
> can revoke a provider at any time with `/adversarial:cross-model-review revoke <provider key>`.

**3. Ask** (up to 4 questions per call, as many calls as it takes). Never split one tool's
questions across calls when they fit in one: the first call holds OpenAI and Google, and the
opencode questions go together in the next call (all of them, when they are 4 or fewer), so the
person sees "opencode 1/3", "2/3" and "3/3" side by side. Follow-up questions for a model come in
the call after that. When nothing else is offered, the opencode questions start in the first call.
When the questions take more than one call, say so in one short line right after the notice, before
the first call, naming what each screen holds (for example, "First OpenAI and Google; then, on a
second screen, the opencode makers, in 3 questions."), so a screen without opencode does not look
like opencode was left out.

- One question for OpenAI (Codex) and one for Google (Antigravity), when offered: "Which model
  should <provider> use in this project? Choosing one authorizes it." Options: up to 3 models (for
  Codex, "Codex default" first, then models from its list), plus **"Do not use"**. A model's
  description says what sets it apart, never its id again: for Codex, the `<about>` of step 1,
  translated (for example, "the most capable, for demanding work"); for Antigravity, its display
  name with the level in parentheses read as reasoning effort (for example, "Gemini 4 Argon, medium
  reasoning effort"). When the list has
  more models, the question text names them and says that any of them can be typed in the free-text
  answer the tool adds below the options; never give that answer the name of the opencode
  "Other" option below, in any language. When Codex's list comes back empty, offer
  only "Codex default" and say that a model id can be typed in the free-text answer.
- The opencode makers, as multi-select questions: "Which makers should opencode use in this
  project (1/3)? Each one checked is authorized.", in the user's language, with every word translated, "makers"
  included, and with the question's position and the total. **Every** provider
  worked out in step 1 from opencode gets an option, with nothing left out to save a question: each
  identified maker (`providers.md`, "opencode makers") that has at least one non-Claude model, and,
  when any model's maker is not identified, one last option, **"Other opencode models (maker not
  identified)"**, with the provider key `opencode:other`. Up to 4 options per question, so 8 makers
  plus "Other" take 3 questions; questions that do not fit in the current call go in the next one.
  Text typed in the free-text answer of these questions is a comment, never a maker. The question
  text ends with "Leave all unchecked to use none of them." A question that comes back with nothing
  checked, or with no answer at all, is a complete answer: none of its makers is chosen, each is
  `authorized: false`, and it is never asked again in this setup.

Before the first call, count the options against step 1: every maker found and the "Other" option,
when it applies, must be in some question.

**Option descriptions stay short**, one line, the same pattern in every option: the model id (or
"model chosen next: <model>, <model>" when the maker has several), then `·` and the tags that apply:
"free" for a model whose name ends in `-free`, "via OpenCode Zen" for a model under the `opencode/`
route, and for the "Other" option "maker not identified; each model's route is named". For
example: `opencode/deepseek-v4.1-flash-free · free · via OpenCode Zen`, with the tags translated.

**Extra notices, once in the question text, never repeated in each option** (D-57): when any option
of that question has the "via OpenCode Zen" tag, "Models via OpenCode Zen go through opencode's own
service to their maker."; when any has the "free" tag, "Free-tier models: terms on use, retention
and training of prompts and code are usually looser than paid plans."; when it has the "Other"
option, "For models whose maker is not identified, the terms are those of each model's route." The
follow-up question for a maker with several models follows the same rules.

**4. Save the file** (the preparation subagent does it with the rest of the run; the main session,
only when the run stops before that, or for `setup` alone: then open the file with the `Read` tool,
never `cat`, and rewrite it whole with `Write`). Every chosen provider is `authorized: true` with its model and the date; every
provider offered and not chosen ("Do not use", or a maker left unchecked) is `authorized: false`.
If no provider is authorized, the run stops without reviewing and suggests `/adversarial:review`
(D-28). The setup never runs again by itself for a project that has an entry; the person asks for
it.

## Revoking

`revoke <provider>` sets `authorized: false` for that provider in the project of the session's
working directory (or of the path given after the provider). A run already started keeps the
authorization it had (D-39); the next one sends nothing to that provider.
