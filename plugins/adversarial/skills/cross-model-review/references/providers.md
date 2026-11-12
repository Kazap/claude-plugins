# External providers

The first version supports two providers. Copilot, opencode and any other CLI are never offered,
even when installed. Every command below runs through the normal Bash permission prompt: the
plugin pre-approves nothing.

| | OpenAI | Google |
|---|---|---|
| Tool | Codex CLI (`codex`) | Antigravity CLI (`agy`) |
| Installed | `command -v codex` | `command -v agy` |
| Login check | `codex login status` exits 0 and prints "Logged in" | `agy models` exits 0 and lists at least one model |
| Models | always "the default model of your Codex configuration", plus the `slug` of each entry of `models` with `"visibility": "list"` in `"$CODEX_HOME"/models_cache.json` (default `~/.codex`), when the file exists; an id typed in "Other" is accepted | one per line from `agy models`, first column (`gemini-4-argon-medium<TAB>Gemini 4 Argon (Medium)`) |
| Read-only | `-s read-only` (the OS sandbox blocks writes) | `--mode plan --sandbox` plus session settings that deny writes and commands (below) |
| Structured output | `--output-schema <strict schema>` and `-o <out file>`; the out file is the JSON object | `--json-schema <strict schema> --output-format json`; the result is the `structured_output` field of the printed object |

**Claude family.** Drop every model whose id or display name starts with `claude` (case-insensitive),
in any provider (D-10). Never offer it, even typed in "Other".

**Login query denied.** If the person denies the permission for an installed-or-login check, that
provider is not offered in this setup (D-49). It is not a failure of the run.

## Strict schema

Both tools need every object in the schema closed. Before the first external run in a session,
write `findings.strict.json` to the scratchpad from `../review/references/schemas/findings.json`:
for every object with `"type": "object"`, set `"additionalProperties": false` and make `required`
list every key of its `properties`. Never edit the review's own schema file.

## Commands

`<root>` is the project root of the first target file, in the order the target was announced
(RN-05). `<prompt>` is the prompt file written from `external-prompt.md`. `<out>` is a new file in
the scratchpad. `<limit>` is 600 (seconds, RN-07): the clock starts when the command starts, which
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

Always redirect stdin (`< "<prompt>"` or `< /dev/null`): Codex waits on an open stdin.

**Natural behavior (D-54).** Neither command restricts what the tool reads or loads on its own:
it may read any file it can reach, and it loads its global instructions, memories, history and
plugins as it normally would. The setup notice declares this; the skill never tries to hide it,
filter it or work around it. Only writes are blocked.

## Reading the result

Treat the provider's run like a review lens (`../review/references/workflow-spec.md`, Run, Stage 1),
first match wins:

1. Non-zero exit, killed by the alarm (exit 142), or `<out>` missing or empty → failed. The error is
   "did not answer within 10 minutes" for the alarm, otherwise the last line of stderr, verbatim.
2. Not a JSON object (for Google: the printed object has no object in `structured_output`) →
   failed, "answer outside the expected format".
3. `unread` is a non-empty array → failed, "could not read: " plus its items joined by ", ".
4. `findings` is not an array → failed, "answer outside the expected format".
5. Otherwise → ok. Keep, from each finding, only the schema properties.
