// Local test of the review workflow, with no API calls and no tokens.
// The plugin ships no script: Claude writes one per session from
// plugins/adversarial/skills/review/references/workflow-spec.md. This test runs such a script
// with simulated agent/parallel/pipeline and checks it against the spec and the schemas.
// Lives outside the plugin folder, so it is not installed.
// Usage: node tests/adversarial/test-workflow-spec.mjs [script.js]
// Without an argument it runs tests/adversarial/reference-workflow.js, a script written from the spec.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REF = join(here, "..", "..", "plugins", "adversarial", "skills", "review", "references");
const source = readFileSync(process.argv[2] || join(here, "reference-workflow.js"), "utf8");
const spec = readFileSync(join(REF, "workflow-spec.md"), "utf8");
const SCHEMAS = {
  findings: JSON.parse(readFileSync(join(REF, "schemas/findings.json"), "utf8")),
  verdict: JSON.parse(readFileSync(join(REF, "schemas/verdict.json"), "utf8")),
};
const block = after => { const i = spec.indexOf(after); assert.ok(i >= 0, after); const m = spec.slice(i).match(/```\n([\s\S]*?)\n```/); return m[1]; };
const FIXED = Object.fromEntries(["READ_ONLY", "SEVERITY_RUBRIC", "LENS_LANGUAGE", "REPORT_RULES", "SKEPTIC_LANGUAGE", "SKEPTIC_RULES"].map(n => [n, block(`**${n}**\n`)]));
const READ_ONLY = FIXED.READ_ONLY;
const fill = (tpl, v) => tpl.replace(/\{([a-zA-Z_.]+)\}/g, (_, k) => (k in v ? v[k] : `{${k}}`));
function expectedTarget(a) {
  const parts = [];
  if (a.paths && a.paths.length) {
    const intro = a.content
      ? "Read these in full with the Read tool before answering; they are context, the review is about the content under review below."
      : "Read these in full with the Read tool before answering; the review is about them.";
    parts.push(["## Target files", "", intro, ...a.paths.map(x => `- ${x}`)].join("\n"));
  }
  if (a.content) parts.push(["## Content under review (verbatim)", "", a.content].join("\n"));
  if (a.facts) parts.push(["## Verified facts (checked by the main reviewer; re-check any you rely on for a high/critical finding)", "", a.facts].join("\n"));
  return parts.join("\n\n");
}
const LENS_TPL = block("**Lens prompt:**");
const SKEPTIC_TPL = block("**Skeptic prompt:**");

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
  assert.equal(out.review.lenses, 3);
  assert.deepEqual(out.review.failed.map(f => f.lens).sort(), ["b", "c"]);
  assert.equal(out.review.ok, 1);
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


test("args serialized as a JSON string are accepted as an object", async () => {
  const h = harness(() => ({ findings: [] }));
  const out = await h.exec(JSON.stringify(baseArgs({ content: "use `x` and ${y}" })));
  assert.equal(h.calls.length, 3);
  assert.match(h.calls[0].prompt, /use `x` and \$\{y\}/);
  assert.equal(out.review.ok, 3);
});

test("a non-JSON string fails early with a message that names the error", async () => {
  const h = harness(() => ({ findings: [] }));
  await assert.rejects(h.exec("{language: pt"), /JSON/);
  assert.equal(h.calls.length, 0);
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
  assert.match(out.review.failed.find(f => f.lens === "c").error, /budget/);
});

// In the runtime, a terminal API error arrives as null, not as an exception.
test("a terminal API error (null) becomes failed with a generic cause, no invented code", async () => {
  const h = harness((prompt, opts) => (opts.label === "c" ? null : { findings: [] }));
  const out = await h.exec(baseArgs());
  assert.match(out.review.failed.find(f => f.lens === "c").error, /skipped or terminal API error/);
});

test("a verifier that rejects also leaves uncertain", async () => {
  const h = harness((prompt, opts) => {
    if (opts.phase === "Verify") throw new Error("x");
    return { findings: [finding({ severity: "critical" })] };
  });
  const out = await h.exec(baseArgs());
  for (const f of out.results.flatMap(r => r.findings)) assert.equal(f.verification.verdict, "uncertain");
});

test("a crashing stage becomes a failed lens ('stage crashed'), never brings the workflow down", async () => {
  const h = harness(() => ({ findings: [null] }));
  const out = await h.exec(baseArgs());
  assert.equal(out.review.lenses, 3);
  assert.ok(out.review.failed.length === 3 && out.review.failed.every(f => f.error === "stage crashed"));
});

test("a lens that did not read the target becomes failed, never 'nothing found'", async () => {
  const h = harness((prompt, opts) =>
    opts.label === "b" ? { unread: ["/repo/docs/plan.md"], findings: [] } : { unread: [], findings: [] }
  );
  const out = await h.exec(baseArgs());
  const b = out.review.failed.find(f => f.lens === "b");
  assert.ok(b, "lens b should be in failed");
  assert.match(b.error, /could not read: \/repo\/docs\/plan\.md/);
  assert.equal(out.review.ok, 2);
});

test("an effort outside the enum is refused before spending an agent", async () => {
  const h = harness(() => ({ findings: [] }));
  await assert.rejects(h.exec(baseArgs({ lenses: [lens("a", { effort: "max" }), lens("b"), lens("c")] })));
  assert.equal(h.calls.length, 0);
});

// Mirrors the read-only check in SKILL.md, Phase 4.
test("the script passes the read-only check", () => {
  const lines = source.split("\n");
  assert.ok(lines.filter(l => l.includes("Never use Edit, Write, NotebookEdit, or any command that changes files")).length >= 1);
  assert.equal(lines.filter(l => l.includes("READ_ONLY")).length, 3);
  assert.equal(lines.filter(l => /agentType|isolation|permission|tools|cwd/i.test(l)).length, 0);
});

test("meta matches the spec", () => {
  const meta = source.match(/export const meta = \{[\s\S]*?\n\}/)[0];
  assert.match(meta, /name: ['"]adversarial-review['"]/);
  assert.match(meta, /Read-only review by content-calibrated lenses, with adversarial verification of critical\/high findings/);
  assert.match(meta, /['"]Review['"]/);
  assert.match(meta, /['"]Verify['"]/);
});

test("fixed text reaches every prompt character for character; no plugin file is referenced", async () => {
  const h = harness((prompt, opts) =>
    opts.phase === "Verify" ? { verdict: "confirmed", reason: "x" } : { findings: [finding({ severity: "high" })] }
  );
  await h.exec(baseArgs());
  for (const c of h.calls) {
    const want = c.opts.phase === "Verify"
      ? ["READ_ONLY", "SKEPTIC_LANGUAGE", "SKEPTIC_RULES", "SEVERITY_RUBRIC"]
      : ["READ_ONLY", "LENS_LANGUAGE", "SEVERITY_RUBRIC", "REPORT_RULES"];
    for (const n of want) assert.ok(c.prompt.includes(FIXED[n]), `${n} missing in ${c.opts.label}`);
    assert.doesNotMatch(c.prompt, /brief|workflow-spec|references\//i);
    assert.match(c.prompt, /Review language: Brazilian Portuguese/);
  }
});
test("prompt order: READ_ONLY, language, target, lens question, report rules", async () => {
  const h = harness(() => ({ findings: [] }));
  await h.exec(baseArgs({ paths: ["/repo/a.md"], facts: "- f1" }));
  const p = h.calls[0].prompt;
  const at = s => { const i = p.indexOf(s); assert.ok(i >= 0, `missing ${s}`); return i; };
  const order = [at(READ_ONLY), at("Review language:"), at(FIXED.LENS_LANGUAGE), at("## Target files"),
    at("## Content under review (verbatim)"), at("## Verified facts (checked by the main reviewer; re-check any you rely on for a high/critical finding)"), at("## Your lens"), at("question for a"),
    at("## How to report"), at(FIXED.SEVERITY_RUBRIC), at(FIXED.REPORT_RULES)];
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
  assert.match(p, /they are context, the review is about the content under review below/);
});
test("agents get the schemas from the JSON files, unchanged", async () => {
  const h = harness((prompt, opts) =>
    opts.phase === "Verify" ? { verdict: "confirmed", reason: "x" } : { findings: [finding({ severity: "critical" })] }
  );
  await h.exec(baseArgs());
  for (const c of h.calls) {
    assert.deepEqual(c.opts.schema, c.opts.phase === "Verify" ? SCHEMAS.verdict : SCHEMAS.findings);
  }
});

test("results keep lens order; logs report raw count and failures", async () => {
  const h = harness((prompt, opts) => (opts.label === "a" ? null : { findings: [finding()] }));
  const out = await h.exec(baseArgs());
  assert.deepEqual(out.results.map(r => r.lens), ["a", "b", "c"]);
  assert.ok(h.logs.some(l => /1 of 3 lenses failed: a \(/.test(l)), h.logs.join(" | "));
  assert.ok(h.logs.some(l => /2 raw findings from 2 lenses/.test(l)), h.logs.join(" | "));
});

test("the skeptic prompt names the lens key and severity and carries the whole finding", async () => {
  const h = harness((prompt, opts) =>
    opts.phase === "Verify" ? { verdict: "refuted", reason: "x" }
      : { findings: [finding({ severity: "critical", problem: "PROB", location: "LOC", evidence: "EVD", proposed_fix: "FIX" })] }
  );
  await h.exec(baseArgs({ lenses: [lens("a")] }));
  const v = h.calls.find(c => c.opts.phase === "Verify");
  assert.match(v.prompt, /lens "a"\) reported the finding below as critical/);
  for (const s of ["PROB", "LOC", "EVD", "FIX", "question for a", "## Finding under verification"]) assert.ok(v.prompt.includes(s), s);
  assert.equal("model" in v.opts, false);
});

test("lens and skeptic prompts equal the spec templates exactly", async () => {
  const a = baseArgs({ paths: ["/repo/a.md", "/repo/b.md"], content: "line1\nuse `x` and ${y} and $& $1", facts: "- f1\n- f2" });
  const f = finding({ severity: "high", problem: "P\nP2", proposed_fix: "Before: a\nAfter: $& b" });
  const h = harness((prompt, opts) => (opts.phase === "Verify" ? { verdict: "confirmed", reason: "x" } : { findings: [f] }));
  await h.exec({ ...a, lenses: [lens("a")] });
  const base = { ...FIXED, language: a.language, target: expectedTarget(a), "lens.question": "question for a", "lens.key": "a" };
  const lensCall = h.calls.find(c => c.opts.phase === "Review");
  assert.equal(lensCall.prompt, fill(LENS_TPL, base));
  const v = h.calls.find(c => c.opts.phase === "Verify");
  const fv = Object.fromEntries(Object.entries(f).map(([k, x]) => [`finding.${k}`, x]));
  assert.equal(v.prompt, fill(SKEPTIC_TPL, { ...base, ...fv }));
});

test("content-only and paths-only target blocks match the spec", async () => {
  for (const a of [baseArgs(), baseArgs({ content: undefined, paths: ["/r/x.md"] })]) {
    const h = harness(() => ({ findings: [] }));
    await h.exec({ ...a, lenses: [lens("a")] });
    assert.ok(h.calls[0].prompt.includes("\n\n" + expectedTarget(a) + "\n\n## Your lens"));
  }
});

test("stricter validation from the spec", async () => {
  for (const bad of [
    baseArgs({ language: "   " }),
    baseArgs({ paths: [1] }),
    baseArgs({ paths: "x" }),
    baseArgs({ content: "  ", paths: undefined }),
    baseArgs({ facts: ["x"] }),
    baseArgs({ lenses: [lens("a", { model: "" })] }),
    baseArgs({ lenses: [lens("a", { question: "  " })] }),
    baseArgs({ lenses: "a" }),
    null,
  ]) {
    const h = harness(() => ({ findings: [] }));
    await assert.rejects(h.exec(bad), `should reject ${JSON.stringify(bad)?.slice(0, 80)}`);
    assert.equal(h.calls.length, 0);
  }
});

test("a skeptic answer without a verdict counts as uncertain", async () => {
  const h = harness((prompt, opts) => (opts.phase === "Verify" ? { reason: "x" } : { findings: [finding({ severity: "high" })] }));
  const out = await h.exec(baseArgs({ lenses: [lens("a")] }));
  assert.equal(out.results[0].findings[0].verification.verdict, "uncertain");
});

test("missing unread counts as empty; model option absent when unset", async () => {
  const h = harness(() => ({ findings: [] }));
  const out = await h.exec(baseArgs());
  assert.equal(out.review.ok, 3);
  for (const c of h.calls) assert.equal(Object.prototype.hasOwnProperty.call(c.opts, "model"), false);
});

test("null optional fields are absent; empty paths with content is fine", async () => {
  for (const ok of [baseArgs({ paths: [] }), baseArgs({ facts: null, paths: null }), baseArgs({ lenses: [lens("a", { effort: null, model: null })] })]) {
    const h = harness(() => ({ findings: [] }));
    const out = await h.exec(ok);
    assert.ok(out.review.ok >= 1);
    assert.ok(!h.calls[0].prompt.includes("## Target files"));
    assert.ok(!h.calls[0].prompt.includes("## Verified facts (checked by the main reviewer; re-check any you rely on for a high/critical finding)"));
  }
  for (const bad of [baseArgs({ content: 42, paths: ["/r/x"] }), baseArgs({ paths: [], content: " " })]) {
    const h = harness(() => ({ findings: [] }));
    await assert.rejects(h.exec(bad));
    assert.equal(h.calls.length, 0);
  }
});

test("a non-object finding crashes only its lens", async () => {
  const h = harness((p, o) => (o.label === "a" ? { findings: ["oops"] } : { findings: [] }));
  const out = await h.exec(baseArgs());
  assert.deepEqual(out.review.failed, [{ lens: "a", error: "stage crashed" }]);
  assert.equal(out.review.ok, 2);
});

test("unread wins over a missing findings list", async () => {
  const h = harness((p, o) => (o.label === "a" ? { unread: ["/a.md"] } : { findings: [] }));
  const out = await h.exec(baseArgs());
  assert.match(out.review.failed[0].error, /could not read: \/a\.md/);
});

test("output findings keep only schema properties; verification comes only from a skeptic", async () => {
  const fake = { verdict: "confirmed", reason: "self-verified" };
  const h = harness((p, o) => {
    if (o.phase === "Verify") return { verdict: "refuted", reason: "skeptic" };
    if (o.label !== "a") return { findings: [] };
    return {
      findings: [
        finding({ severity: "medium", verification: fake, status: "x" }),
        finding({ kind: "decision", severity: "high", verification: fake }),
        finding({ severity: "critical", verification: fake, status: "x" }),
      ],
    };
  });
  const out = await h.exec(baseArgs());
  const [med, dec, crit] = out.results[0].findings;
  assert.ok(!("verification" in med));
  assert.ok(!("status" in med));
  assert.ok(!("status" in crit));
  assert.ok(!("verification" in dec));
  assert.equal(crit.verification.verdict, "refuted");
  assert.equal(med.severity, "medium");
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
