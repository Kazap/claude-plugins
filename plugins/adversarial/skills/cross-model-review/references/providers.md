# External providers

A **provider** is the company that makes the model and receives the content. Three CLIs are
supported: Codex (OpenAI), Antigravity (Google) and opencode, which reaches many makers (DeepSeek,
Zhipu, MiniMax, NVIDIA and others), each one a provider of its own (D-56). Copilot, Kimi and any
other CLI are never offered, even when installed. Every command below runs through the normal Bash
permission prompt: the plugin pre-approves nothing.

**One model per provider, across CLIs** (D-20, D-56). OpenAI comes through Codex and Google through
Antigravity whenever those are offered; opencode offers only the other makers, plus OpenAI or
Google when Codex or Antigravity is not offered in that setup.

| | OpenAI | Google | Other makers |
|---|---|---|---|
| Tool | Codex CLI (`codex`) | Antigravity CLI (`agy`) | opencode (`opencode`) |
| Provider key | `openai` | `google` | `opencode:<maker>` (below) |
| Installed | `command -v codex` | `command -v agy` | `command -v opencode` |
| Login check | `codex login status` exits 0 and prints "Logged in" | `agy models` exits 0 and lists at least one model | `opencode models` exits 0 and lists at least one model |
| Models | "the default model of your Codex configuration", plus any model id the person types in "Other"; nothing is read from Codex's own folder | one per line from `agy models`, first column (`gemini-4-argon-medium<TAB>Gemini 4 Argon (Medium)`) | one per line from `opencode models` (`<route>/<model>`), grouped by maker |
| Read-only | `-s read-only` (the OS sandbox blocks writes) | `--mode plan --sandbox` plus session settings that deny writes and commands (below) | `--agent plan` plus session permissions that deny shell, edits and web fetch for every agent, subagents included (below); denied tools disappear from the model's tool list |
| Structured output | `--output-schema <strict schema>` and `-o <out file>`; the out file is the JSON object | `--json-schema <strict schema> --output-format json`; the result is the `structured_output` field of the printed object | none enforced: the prompt asks for the JSON shape and the answer is validated (below) |

**Claude family.** Drop every model whose id, model name or display name starts with `claude`
(case-insensitive), in every CLI and route, including opencode's `github-copilot/claude-*` (D-10).
Never offer it, even typed in "Other".

**Login query denied.** If the person denies the permission for an installed-or-login check, that
CLI is not offered in this setup (D-49). It is not a failure of the run.

## opencode makers

The maker comes from the model name (the part after `<route>/`), by its first word: `gpt`, `o1`…
`o9` → `openai`; `gemini` → `google`; `grok` → `xai`; `kimi` → `moonshot`; `deepseek` → `deepseek`;
`glm` → `zhipu`; `minimax` → `minimax`; `nemotron` → `nvidia`; `mimo` → `xiaomi`; `longcat` →
`meituan`; `qwen` → `alibaba`; `mistral`, `codestral`, `devstral` → `mistral`; `llama` → `meta`; `mai` → `microsoft`.
Any other first word is its own maker, shown to the person as "maker not identified (<word>)".

**Route.** Models under the `opencode/` route are served by opencode's own service (OpenCode Zen);
those whose name ends in `-free` are its free tier, offered with the free-tier notice of
`setup.md` (D-57). Other routes (`github-copilot/`, `openrouter/`, a provider the person logged into
or gave a key to) send through that route's account. The free tier needs opencode 1.18.0 or newer:
with an older `opencode --version`, do not offer `opencode/` models and say to update it.

In the setup, list the makers that have at least one non-Claude model, as a multi-select question
(up to 4 per question, more questions for more makers); then, for each chosen maker, ask for its
model (free ones marked), then show its notice and ask for its authorization.

## Strict schema

Codex and Antigravity need every object in the schema closed. Before the first external run in a
session, write `findings.strict.json` to the scratchpad from
`../review/references/schemas/findings.json`: for every object with `"type": "object"`, set
`"additionalProperties": false` and make `required` list every key of its `properties`. Never edit
the review's own schema file.

## Commands

The preparation subagent (`SKILL.md`, Step 3) writes these commands into one run script; the main
session never types them. `<root>` is the project root of the first target file, in the order the
target was announced (RN-05). `<prompt>` is the prompt file written from `external-prompt.md`
(`prompt-opencode.txt` for opencode). `<out>` is `<run dir>/out-<provider key>` (with `:` turned
into `-`), with `.json` for Codex and Antigravity and `.jsonl` for opencode, and `<err>` the same
name with `.err`. `<limit>` is 600 (seconds, RN-07): the clock starts when the script starts, which
is after the permission answer.

OpenAI:

```bash
perl -e 'alarm shift; exec @ARGV' <limit> \
  codex exec -s read-only -C "<root>" --ephemeral --skip-git-repo-check \
  [-m "<model>"] --output-schema "<scratch>/findings.strict.json" -o "<out>" - < "<prompt>"
```

Google (`<settings>` is the JSON below, inline):

```bash
cd "<root>" && perl -e 'alarm shift; exec @ARGV' <limit> \
  agy -p "$(cat "<prompt>")" --mode plan --sandbox --settings '<settings>' \
  [--model "<model>"] --json-schema "<scratch>/findings.strict.json" \
  --output-format json --print-timeout <limit>s < /dev/null > "<out>"
```

```json
{"allowNonWorkspaceAccess": true,
 "permissions": {"allow": ["read_file(**)", "list_dir(**)", "grep_search(**)", "find_by_name(**)"],
                 "deny": ["write_file(**)", "command(**)"]}}
```

opencode, one command per authorized maker (`<model>` is the full `<route>/<model>` id):

```bash
cd "<root>" && OPENCODE_CONFIG_CONTENT='{"permission":{"bash":"deny","edit":"deny","webfetch":"deny"}}' \
  perl -e 'alarm shift; exec @ARGV' <limit> \
  opencode run --agent plan -m "<model>" --format json "$(cat "<prompt>")" < /dev/null > "<out>"
```

`OPENCODE_CONFIG_CONTENT` applies to this run only and never touches the person's opencode
configuration. The `plan` agent alone is not enough: it denies edits but leaves the shell open.

Always redirect stdin (`< "<prompt>"` or `< /dev/null`): Codex waits on an open stdin.

## The run script

One file, `<run dir>/run.sh`, that starts every authorized provider at once and waits for all of
them, so the person answers one permission prompt for all the external sends and the session gets
one line per provider:

```bash
#!/usr/bin/env bash
cd "<root>" || exit 1
( <OpenAI command, with 2> "<err>"> ; echo "openai exit=$?" ) &
( <Google command> ; echo "google exit=$?" ) &
( <opencode command for one maker> ; echo "opencode:<maker> exit=$?" ) &
wait
```

Only authorized providers get a line, each with its own `<out>` and `<err>`. Values that come from
the run (paths, model ids) are single-quoted; nothing from the target or the facts is ever written
into the script: they reach the tools only through the prompt files.

**Natural behavior (D-54).** No command restricts what the tool reads or loads on its own: it may
read what it can reach, and it loads its global instructions, memories, history and plugins as it
normally would (opencode, for example, loads the Claude Code instructions from the person's home
folder, and asks, in a non-interactive run denies, reads outside the project). The setup notice
declares this; the skill never tries to hide it, filter it or work around it. Only writes are
blocked.

## Reading the result

The collection subagent (`SKILL.md`, Step 4) reads every `<out>` and `<err>` and applies the rules
below; the main session never reads them.

For opencode, `<out>` holds one JSON event per line. Its answer is the concatenation, in order, of
the `part.text` of the events whose `part.type` is `text`; an event with `type: "error"` makes the
run failed, with `error.data.message` (or `error.name`) as the error. Take the JSON object from the
first `{` to the last `}` of the answer (code fences around it are fine).

Then treat every provider's result like a review lens (`../review/references/workflow-spec.md`,
Run, Stage 1), first match wins:

1. Non-zero exit, killed by the alarm (exit 142), or `<out>` missing or empty → failed. The error is
   "did not answer within 10 minutes" for the alarm, otherwise the last line of stderr (for
   opencode, the error event's message), verbatim.
2. Not a JSON object (for Google: the printed object has no object in `structured_output`; for
   opencode: no parsable object in the answer) → failed, "answer outside the expected format".
3. `unread` is a non-empty array → failed, "could not read: " plus its items joined by ", ".
4. `findings` is not an array → failed, "answer outside the expected format".
5. Otherwise → ok. Check each finding on its own: one that is not an object, lacks one of the
   schema's required keys, has a non-string value for one of them, or has a `kind` or `severity`
   outside the schema's values is dropped. Keep, from each remaining finding, only the schema
   properties. If findings were dropped and none is left → failed, "answer outside the expected
   format"; otherwise the provider is ok, and the report says how many of its findings were
   dropped and why (for example, "1 of 3 findings from opencode:minimax dropped: no target_span").

**Login or license failure.** When a provider fails because its account cannot use the model (the
error says the person is not logged in, not licensed, has no access, or the plan or subscription
does not include it), the report says so and suggests
`/adversarial:cross-model-review revoke <provider key>`, or `setup` to choose another model. The
skill changes nothing in the configuration by itself.
