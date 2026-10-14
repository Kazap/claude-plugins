// Local test of the panel workflow, with no API calls and no tokens.
// Runs the body of plugins/adversarial/workflows/panel.js with simulated
// agent/parallel/pipeline. Lives outside the plugin folder, so it is not installed.
// Usage: node tests/adversarial/test-panel-workflow.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "..", "plugins", "adversarial", "workflows", "panel.js"), "utf8");

// The Workflow runtime accepts top-level `export const meta` and `return`; Node does not.
const body = source.replace(/^export const meta/m, "const meta");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction("agent", "parallel", "pipeline", "phase", "log", "args", body);

// Same semantics as the documented runtime: a thunk/stage that throws becomes null.
async function parallel(thunks) {
  return Promise.all(thunks.map(t => Promise.resolve().then(t).catch(() => null)));
}
async function pipeline(items, ...stages) {
  return Promise.all(items.map(async (item, i) => {
    let acc = item;
    try {
      for (const stage of stages) acc = await stage(acc, item, i);
      return acc;
    } catch {
      return null;
    }
  }));
}

function harness(respond) {
  const calls = [];
  const logs = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, opts });
    return respond(prompt, opts);
  };
  return {
    calls,
    logs,
    exec: args => run(agent, parallel, pipeline, () => {}, m => logs.push(m), args),
  };
}

const finding = (over = {}) => ({
  kind: "defect",
  problem: "p",
  severity: "low",
  location: "§1",
  evidence: "quoted excerpt",
  proposed_fix: "Antes: a\nDepois: b",
  target_span: "a",
  ...over,
});

const lens = (key, over = {}) => ({ key, question: `question for ${key}`, ...over });

const baseArgs = over => ({
  language: "Brazilian Portuguese",
  content: "content",
  lenses: [lens("a"), lens("b"), lens("c")],
  ...over,
});

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("meta is a pure literal, with no interpolation", () => {
  const meta = source.match(/export const meta = \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(meta, /\$\{|`/);
});

test("the script does not interpolate content: everything arrives via args", () => {
  assert.doesNotMatch(source, /__REPLACE_WITH/);
  assert.doesNotMatch(source, /const CONTENT = `/);
});

test("backticks and ${} in the content reach the prompt intact", async () => {
  const tricky = "Use `npm test` and ${SITE_URL}/x\n```ts\nconst a = `b`\n```";
  const h = harness(() => ({ findings: [] }));
  await h.exec(baseArgs({ content: tricky }));
  assert.equal(h.calls.length, 3);
  for (const c of h.calls) assert.ok(c.prompt.includes(tricky));
});

test("every lens prompt forbids edits and pins the language", async () => {
  const h = harness(() => ({ findings: [] }));
  await h.exec(baseArgs());
  assert.equal(h.calls.length, 3);
  for (const c of h.calls) {
    assert.match(c.prompt, /READ-ONLY/);
    assert.match(c.prompt, /Never use Edit, Write, NotebookEdit/);
    assert.match(c.prompt, /Brazilian Portuguese/);
  }
});

test("file target: lenses receive the paths to read", async () => {
  const h = harness(() => ({ findings: [] }));
  await h.exec(baseArgs({ content: undefined, paths: ["/repo/docs/plan.md"] }));
  assert.equal(h.calls.length, 3);
  for (const c of h.calls) assert.match(c.prompt, /\/repo\/docs\/plan\.md/);
});

test("verified facts go into the prompt, labeled as such", async () => {
  const h = harness(() => ({ findings: [] }));
  await h.exec(baseArgs({ facts: "- next 15.3 (package.json)" }));
  assert.equal(h.calls.length, 3);
  for (const c of h.calls) {
    assert.match(c.prompt, /Verified facts/);
    assert.match(c.prompt, /next 15\.3/);
  }
});

test("a lens that returns null or throws shows up in failed, never disappears", async () => {
  const h = harness((prompt, opts) => {
    if (opts.label === "b") return null;
    if (opts.label === "c") throw new Error("API terminal");
    return { findings: [finding()] };
  });
  const out = await h.exec(baseArgs());
  assert.equal(out.panel.lenses, 3);
  assert.deepEqual(out.panel.failed.map(f => f.lens).sort(), ["b", "c"]);
  assert.equal(out.panel.ok, 1);
  assert.equal(out.raw_count, 1);
  assert.ok(h.logs.some(l => /fail/i.test(l)));
});

test("only critical/high go through adversarial verification", async () => {
  const h = harness((prompt, opts) => {
    if (opts.phase === "Verify") return { verdict: "confirmed", reason: "checked" };
    return {
      findings: [
        finding({ severity: "high", problem: "high" }),
        finding({ severity: "critical", problem: "critical" }),
        finding({ severity: "medium", problem: "medium" }),
        finding({ severity: "low", problem: "low" }),
      ],
    };
  });
  const out = await h.exec(baseArgs({ lenses: [lens("a"), lens("b"), lens("c")] }));
  const verifyCalls = h.calls.filter(c => c.opts.phase === "Verify");
  assert.equal(verifyCalls.length, 6);
  for (const c of verifyCalls) assert.match(c.prompt, /READ-ONLY/);
  const all = out.results.flatMap(r => r.findings);
  assert.equal(all.filter(f => f.verification).length, 6);
  assert.ok(all.filter(f => ["medium", "low"].includes(f.severity)).every(f => !f.verification));
});

test("a failing verifier leaves the finding uncertain, never confirmed", async () => {
  const h = harness((prompt, opts) => {
    if (opts.phase === "Verify") return null;
    return { findings: [finding({ severity: "high" })] };
  });
  const out = await h.exec(baseArgs({ lenses: [lens("a"), lens("b"), lens("c")] }));
  for (const f of out.results.flatMap(r => r.findings)) {
    assert.equal(f.verification.verdict, "uncertain");
  }
});

test("product decisions skip verification", async () => {
  const h = harness((prompt, opts) => {
    if (opts.phase === "Verify") return { verdict: "confirmed", reason: "x" };
    return { findings: [finding({ severity: "high", kind: "decision" })] };
  });
  await h.exec(baseArgs());
  assert.equal(h.calls.filter(c => c.opts.phase === "Review").length, 3);
  assert.equal(h.calls.filter(c => c.opts.phase === "Verify").length, 0);
});

test("default effort is medium; model only when the lens asks for it", async () => {
  const h = harness(() => ({ findings: [] }));
  await h.exec(baseArgs({ lenses: [lens("a"), lens("b", { effort: "high" }), lens("c", { model: "haiku" })] }));
  const byLabel = Object.fromEntries(h.calls.map(c => [c.opts.label, c.opts]));
  assert.equal(byLabel.a.effort, "medium");
  assert.equal(byLabel.b.effort, "high");
  assert.equal("model" in byLabel.a, false);
  assert.equal(byLabel.c.model, "haiku");
});

test("invalid args fail early, without spending an agent", async () => {
  for (const bad of [
    baseArgs({ lenses: [] }),
    baseArgs({ lenses: Array.from({ length: 7 }, (_, i) => lens(`l${i}`)) }),
    baseArgs({ content: undefined, paths: undefined }),
    baseArgs({ language: undefined }),
    baseArgs({ lenses: [lens("a"), lens("a"), lens("b")] }),
    baseArgs({ lenses: [{ key: "a" }] }),
    [],
    JSON.stringify("text"),
  ]) {
    const h = harness(() => ({ findings: [] }));
    await assert.rejects(h.exec(bad));
    assert.equal(h.calls.length, 0);
  }
});


test("meta names the workflow 'panel' and says it is dispatched by the review skill", () => {
  const meta = source.match(/export const meta = \{[\s\S]*?\n\}/)[0];
  assert.match(meta, /name: 'panel'/);
  assert.match(meta, /whenToUse:/);
  assert.match(meta, /\/adversarial:review/);
});

test("a bare invocation (no args) returns guidance without spending an agent", async () => {
  for (const bare of [undefined, null, "", {}, "{}"]) {
    const h = harness(() => ({ findings: [] }));
    const out = await h.exec(bare);
    assert.equal(out.started, false);
    assert.match(out.next, /\/adversarial:review/);
    assert.equal(h.calls.length, 0);
  }
});

test("args serialized as a JSON string are accepted as an object", async () => {
  const h = harness(() => ({ findings: [] }));
  const out = await h.exec(JSON.stringify(baseArgs({ content: "use `x` and ${y}" })));
  assert.equal(h.calls.length, 3);
  assert.match(h.calls[0].prompt, /use `x` and \$\{y\}/);
  assert.equal(out.panel.ok, 3);
});

test("a non-JSON string fails early with a message that names the error", async () => {
  const h = harness(() => ({ findings: [] }));
  await assert.rejects(h.exec("{language: pt"), /JSON/);
  assert.equal(h.calls.length, 0);
});

test("the language setting never asks to translate evidence or target_span", async () => {
  const h = harness(() => ({ findings: [] }));
  await h.exec(baseArgs());
  for (const c of h.calls) {
    assert.match(c.prompt, /verbatim copies from the content or the file, never translated/);
    assert.doesNotMatch(c.prompt, /Write every field in/);
  }
});

test("the skeptic gets the lens question, the target_span and effort >= the lens effort", async () => {
  const h = harness((prompt, opts) => {
    if (opts.phase === "Verify") return { verdict: "confirmed", reason: "x" };
    return { findings: [finding({ severity: "high", target_span: "unique-target-span" })] };
  });
  await h.exec(baseArgs({ lenses: [lens("a", { effort: "high" }), lens("b", { effort: "low" }), lens("c")] }));
  const v = Object.fromEntries(h.calls.filter(c => c.opts.phase === "Verify").map(c => [c.opts.label, c]));
  assert.equal(v["verify:a"].opts.effort, "high");
  assert.equal(v["verify:b"].opts.effort, "medium");
  assert.equal(v["verify:c"].opts.effort, "medium");
  assert.match(v["verify:a"].prompt, /question for a/);
  assert.match(v["verify:a"].prompt, /unique-target-span/);
});

test("a lens whose agent rejects (e.g. budget exhausted) carries the cause into the result", async () => {
  const h = harness((prompt, opts) => {
    if (opts.label === "c") throw new Error("budget exhausted");
    return { findings: [] };
  });
  const out = await h.exec(baseArgs());
  assert.match(out.panel.failed.find(f => f.lens === "c").error, /budget/);
});

// In the runtime, a terminal API error arrives as null, not as an exception.
test("a terminal API error (null) becomes failed with a generic cause, no invented code", async () => {
  const h = harness((prompt, opts) => (opts.label === "c" ? null : { findings: [] }));
  const out = await h.exec(baseArgs());
  assert.match(out.panel.failed.find(f => f.lens === "c").error, /skipped or terminal API error/);
});

test("a verifier that rejects also leaves uncertain", async () => {
  const h = harness((prompt, opts) => {
    if (opts.phase === "Verify") throw new Error("x");
    return { findings: [finding({ severity: "critical" })] };
  });
  const out = await h.exec(baseArgs());
  for (const f of out.results.flatMap(r => r.findings)) assert.equal(f.verification.verdict, "uncertain");
});

test("a crashing stage becomes a failed lens ('stage crashed'), never brings the panel down", async () => {
  const h = harness(() => ({ findings: [null] }));
  const out = await h.exec(baseArgs());
  assert.equal(out.panel.lenses, 3);
  assert.ok(out.panel.failed.length === 3 && out.panel.failed.every(f => f.error === "stage crashed"));
});

test("a lens that did not read the target becomes failed, never 'nothing found'", async () => {
  const h = harness((prompt, opts) =>
    opts.label === "b" ? { unread: ["/repo/docs/plan.md"], findings: [] } : { unread: [], findings: [] }
  );
  const out = await h.exec(baseArgs());
  const b = out.panel.failed.find(f => f.lens === "b");
  assert.ok(b, "lens b should be in failed");
  assert.match(b.error, /could not read: \/repo\/docs\/plan\.md/);
  assert.equal(out.panel.ok, 2);
});

test("an effort outside the enum is refused before spending an agent", async () => {
  const h = harness(() => ({ findings: [] }));
  await assert.rejects(h.exec(baseArgs({ lenses: [lens("a", { effort: "max" }), lens("b"), lens("c")] })));
  assert.equal(h.calls.length, 0);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
