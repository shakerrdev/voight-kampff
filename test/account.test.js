"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load");

const VK = load({
  only: ["src/core.js", "src/text/fingerprints.js", "src/text/style.js", "src/text/analyze.js", "src/account/api.js", "src/account/behaviour.js"],
});

const NOW = 1_790_000_000;
const DAY = 86400;
const ids = (r) => r.signals.map((s) => s.id);

const SUBS = ["cars", "pics", "gaming", "AskReddit", "de", "europe", "news", "funny"];
const HUMAN_LINES = [
  "yeah that happened to me too, dealer was useless",
  "lol no way, thats wild",
  "honestly i'd just return it and get the other model, the newer one is way better for that price imo",
  "source? i've never heard of that",
  "this is the way",
  "the second season was so much better than people give it credit for. the ending was rushed tho",
];

function human() {
  const items = [];
  let t = NOW - 3 * DAY;
  for (let i = 0; i < 60; i++) {
    t -= (i % 7 === 0 ? 20 : 1) * 3600 * (0.3 + ((i * 37) % 11) / 4);
    const hour = new Date(t * 1000).getUTCHours();
    if (hour >= 1 && hour < 8) t -= 8 * 3600;
    items.push({ kind: "comment", text: HUMAN_LINES[i % HUMAN_LINES.length] + ` ${i}`, subreddit: SUBS[i % 3], created: t, score: 3 });
  }
  return {
    status: "ok",
    about: { name: "throwaway_guy", created_utc: NOW - 6 * 365 * DAY, total_karma: 24000, comment_karma: 20000, has_verified_email: true },
    items,
  };
}

const LLM_TEXT = "It's worth noting that this is a nuanced issue. It's not just about convenience — it's about trust. " +
  "Ultimately, the landscape here is multifaceted and ever-evolving. Each option offers expertise, flexibility, and value. " +
  "In conclusion, the right choice depends on your priorities — and that's perfectly okay.";

function bot() {
  const items = [];
  for (let i = 0; i < 100; i++) {
    items.push({
      kind: "comment",
      text: i % 10 === 0 ? `Great overview! Studies show a 30% rise citeturn0search${i}.` : LLM_TEXT,
      subreddit: `sub${i}`,
      created: NOW - i * 1800,
      score: 1,
    });
  }
  return {
    status: "ok",
    about: { name: "Hungry-Lettuce-4821", created_utc: NOW - 12 * DAY, total_karma: 2100, comment_karma: 2000, has_verified_email: false },
    items,
  };
}

test("established human account scores low", () => {
  const r = VK.assessAccount(human(), VK.DEFAULT_SETTINGS, NOW);
  assert.ok(r.score < 0.2, `score ${r.score} ${ids(r)}`);
});

test("young, regular, round-the-clock LLM account scores high", () => {
  const r = VK.assessAccount(bot(), VK.DEFAULT_SETTINGS, NOW);
  assert.ok(r.score > 0.9, `score ${r.score}`);
  for (const id of ["age", "default-name", "cadence", "no-sleep", "volume", "spread", "history-fingerprint", "history-style", "duplicates"]) {
    assert.ok(ids(r).includes(id), `missing ${id}: ${ids(r)}`);
  }
});

test("reactivated dormant account is flagged", () => {
  const items = [];
  for (let i = 0; i < 20; i++) items.push({ kind: "comment", text: "old " + i, subreddit: "a", created: NOW - 4 * 365 * DAY - i * DAY });
  for (let i = 0; i < 20; i++) items.push({ kind: "comment", text: "new " + i, subreddit: "a", created: NOW - i * 2 * DAY - (i % 3) * 7000 });
  const r = VK.assessAccount(
    { status: "ok", about: { name: "oldtimer", created_utc: NOW - 5 * 365 * DAY, total_karma: 400, comment_karma: 300 }, items },
    VK.DEFAULT_SETTINGS,
    NOW,
  );
  assert.ok(ids(r).includes("reactivated"), ids(r).join());
});

test("hidden history with karma is flagged", () => {
  const r = VK.assessAccount(
    { status: "ok", about: { name: "x", created_utc: NOW - 400 * DAY, total_karma: 900, comment_karma: 800 }, items: [] },
    VK.DEFAULT_SETTINGS,
    NOW,
  );
  assert.ok(ids(r).includes("hidden"));
});

test("declared bots are labelled, not scored", () => {
  for (const name of ["AutoModerator", "RemindMeBot", "some_bot"]) {
    const r = VK.assessAccount({ status: "ok", about: { name, created_utc: NOW }, items: [] }, VK.DEFAULT_SETTINGS, NOW);
    assert.equal(r.declared, true, name);
    assert.equal(r.score, 0);
  }
  assert.equal(VK.isDeclaredBot("Talbot"), false);
  assert.equal(VK.isDeclaredBot("abbot"), false);
});

test("suspended and missing accounts", () => {
  assert.ok(VK.assessAccount({ status: "suspended", about: { name: "a" }, items: [] }).signals[0].id === "suspended");
  assert.ok(VK.assessAccount({ status: "missing", about: null, items: [] }).signals[0].id === "missing");
});

test("listing items are normalized", () => {
  const c = VK.normalizeItem({ kind: "t1", data: { body: "hi", subreddit: "a", created_utc: 1, score: 2 } });
  assert.equal(c.kind, "comment");
  const p = VK.normalizeItem({ kind: "t3", data: { title: "T", selftext: "B", subreddit: "a", created_utc: 1 } });
  assert.equal(p.text, "T\n\nB");
  assert.equal(VK.normalizeItem({ kind: "more", data: {} }), null);
});
