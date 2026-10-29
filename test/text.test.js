"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load");

const VK = load({ only: ["src/core.js", "src/text/fingerprints.js", "src/text/style.js", "src/text/analyze.js"] });
const ids = (r) => r.signals.map((s) => s.id);

const HUMAN = "lol yeah i had the same thing happen with my old car. took it to the dealer twice and they couldnt find anything, " +
  "turned out it was a loose heat shield rattling. cost me like 20 bucks at a local shop. dealers are useless sometimes tbh";

const LLM = "It's worth noting that this is a nuanced issue. It's not just about the money — it's about trust. " +
  "Ultimately, the landscape of modern car maintenance is multifaceted and ever-evolving. " +
  "Dealerships offer convenience, expertise, and warranty coverage. Independent shops offer flexibility, lower prices, and personal service. " +
  "In conclusion, the right choice depends on your priorities — and that's perfectly okay.";

test("casual human comment stays low", () => {
  const r = VK.analyzeText({ text: HUMAN });
  assert.ok(r.score < 0.15, `score ${r.score}`);
});

test("stylistic LLM text is flagged but capped below fingerprint confidence", () => {
  const r = VK.analyzeText({ text: LLM });
  assert.equal(r.tier, "style");
  assert.ok(r.score > 0.3 && r.score <= 0.62, `score ${r.score}`);
  assert.ok(ids(r).includes("llm-vocab"));
  assert.ok(ids(r).includes("em-dash"));
});

test("style heuristics can be switched off", () => {
  const r = VK.analyzeText({ text: LLM }, { ...VK.DEFAULT_SETTINGS, styleHeuristics: false });
  assert.equal(r.score, 0);
});

test("chat citation leftovers are a strong fingerprint", () => {
  const r = VK.analyzeText({ text: "The study found a 12% increase citeturn0search3 in yields." });
  assert.ok(ids(r).includes("citation-token"));
  assert.ok(r.score >= 0.9);
  assert.equal(r.tier, "fingerprint");
});

test("private-use citation markers are detected", () => {
  const r = VK.analyzeText({ text: "It was released in 2019.citeturn0search1" });
  assert.ok(ids(r).includes("private-use"));
});

test("narrow no-break space is flagged, French punctuation spacing is not", () => {
  assert.ok(ids(VK.analyzeText({ text: "This is a sentence with weird spaces." })).includes("narrow-nbsp"));
  assert.ok(!ids(VK.analyzeText({ text: "Vraiment ? Oui ! Prix : 10 000 €" })).includes("narrow-nbsp"));
});

test("zero-width and tag characters are flagged", () => {
  assert.ok(ids(VK.analyzeText({ text: "hello​world" })).includes("zero-width"));
  assert.ok(ids(VK.analyzeText({ text: "hello 󠁁󠁂 world" })).includes("tag-chars"));
});

test("emoji presentation selector is not flagged", () => {
  assert.equal(VK.analyzeText({ text: "nice ❤️" }).score, 0);
});

test("AI tracking parameters on links are flagged", () => {
  const r = VK.analyzeText({ text: "see here", links: ["https://example.com/a?utm_source=chatgpt.com"] });
  assert.ok(ids(r).includes("ai-utm"));
  const md = VK.extractLinks("[source](https://x.org/p?ref=1&utm_source=perplexity)");
  assert.ok(ids(VK.analyzeText({ text: "x", links: md })).includes("ai-utm"));
});

test("self disclosure and template leaks", () => {
  assert.ok(ids(VK.analyzeText({ text: "As an AI language model, I can't have opinions." })).includes("self-disclosure"));
  assert.ok(ids(VK.analyzeText({ text: "Best regards, [Your Name]" })).includes("template-leak"));
});

test("unrendered markdown only counts on rendered text", () => {
  const text = "**Key point:** this matters a lot";
  assert.ok(ids(VK.analyzeText({ text })).includes("raw-markdown"));
  assert.ok(!ids(VK.analyzeText({ text, rendered: false })).includes("raw-markdown"));
});

test("watermark detectors plug in", () => {
  const local = load({ only: ["src/core.js", "src/text/fingerprints.js", "src/text/style.js", "src/text/analyze.js"] });
  local.watermark.register({ id: "fake", name: "Fake", detect: (t) => ({ score: t.includes("marked") ? 0.97 : 0 }) });
  const r = local.analyzeText({ text: "this text is marked" });
  assert.ok(ids(r).includes("wm-fake"));
  assert.equal(r.tier, "fingerprint");
  assert.throws(() => local.watermark.register({}));
});
