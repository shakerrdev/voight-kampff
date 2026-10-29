"use strict";

(function (VK) {
  const DAY = 86400;
  const KNOWN_BOTS = new Set([
    "automoderator", "remindmebot", "sneakpeekbot", "wikisummarizerbot", "savevideo", "stabbot",
    "repostsleuthbot", "vredditdownloader", "converter-bot", "haikusbot", "b0trank", "assistantbot",
    "auddbot", "gifreversingbot", "totesmessenger", "botdefense", "chatgpt-bot",
  ]);
  const DEFAULT_NAME = /^[A-Z][a-z]+(?:[-_]?[A-Z][a-z]+){1,2}[-_]?\d{1,5}$/;

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const cv = (xs) => {
    if (xs.length < 2) return null;
    const m = mean(xs);
    if (m === 0) return null;
    return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) / m;
  };

  VK.isDeclaredBot = (name) => KNOWN_BOTS.has(name.toLowerCase()) || /(?:[-_]bot|[a-z0-9]Bot|BOT)$/.test(name);

  function longestQuietHours(timestamps) {
    const hours = new Array(24).fill(0);
    for (const t of timestamps) hours[new Date(t * 1000).getUTCHours()]++;
    let best = 0;
    let run = 0;
    for (let i = 0; i < 48; i++) {
      run = hours[i % 24] === 0 ? run + 1 : 0;
      best = Math.max(best, Math.min(run, 24));
    }
    return best;
  }

  function normalizeBody(text) {
    return text.toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  }

  VK.assessAccount = function assessAccount({ status, about, items }, settings = VK.DEFAULT_SETTINGS, now = Date.now() / 1000) {
    const name = about?.name || "";
    const result = { status, declared: false, score: 0, signals: [], stats: {} };
    if (status === "missing") {
      result.signals.push(VK.signal("missing", "account deleted or shadowbanned", 0.4, "account"));
      result.score = 0.4;
      return result;
    }
    if (status === "suspended") {
      result.signals.push(VK.signal("suspended", "account suspended", 0.6, "account"));
      result.score = 0.6;
      return result;
    }
    if (!about) return result;

    if (VK.isDeclaredBot(name)) {
      result.declared = true;
      result.signals.push(VK.signal("declared", "declared / known bot account", 0, "account"));
      return result;
    }

    const signals = result.signals;
    const add = (id, label, weight, tier = "account") => signals.push(VK.signal(id, label, weight, tier));

    const ageDays = Math.max((now - about.created_utc) / DAY, 0.01);
    const karma = about.total_karma ?? (about.link_karma || 0) + (about.comment_karma || 0);
    const sorted = [...items].sort((a, b) => a.created - b.created);
    const comments = sorted.filter((i) => i.kind === "comment");
    Object.assign(result.stats, { ageDays: Math.round(ageDays), karma, items: items.length });

    if (ageDays < 2) add("age", "account is less than 2 days old", 0.35);
    else if (ageDays < 7) add("age", "account is less than a week old", 0.25);
    else if (ageDays < 30) add("age", "account is less than a month old", 0.15);
    else if (ageDays < 90) add("age", "account is less than 3 months old", 0.06);

    if (DEFAULT_NAME.test(name)) add("default-name", "Reddit-generated default username", 0.12);
    if (about.has_verified_email === false) add("unverified", "email not verified", 0.05);
    if ((about.comment_karma || 0) < 0) add("negative-karma", "negative comment karma", 0.1);

    const velocity = karma / ageDays;
    if (ageDays < 180 && velocity > 300) add("karma-farming", `${Math.round(velocity)} karma/day on a young account`, 0.25);
    else if (ageDays < 365 && velocity > 100) add("karma-farming", `${Math.round(velocity)} karma/day`, 0.1);

    if (items.length === 0 && karma > 50) add("hidden", "post history hidden or empty despite karma", 0.12);

    if (sorted.length >= 15) {
      const gaps = sorted.slice(1).map((it, i) => it.created - sorted[i].created);
      const maxGap = Math.max(...gaps);
      const gapIndex = gaps.indexOf(maxGap);
      const after = sorted.length - gapIndex - 1;
      if (maxGap > 180 * DAY && after >= 15 && now - sorted[gapIndex + 1].created < 90 * DAY) {
        add("reactivated", `woke up after ${Math.round(maxGap / DAY)} days of silence`, 0.3);
      } else if (ageDays > 730 && karma < 1000 && now - sorted[0].created < 30 * DAY && sorted.length >= 40) {
        add("reactivated", "old low-karma account, all visible activity in the last month", 0.2);
      }

      const regularity = cv(gaps.filter((g) => g > 0));
      if (sorted.length >= 20 && regularity !== null && regularity < 0.5) {
        add("cadence", `machine-regular posting interval (CV ${regularity.toFixed(2)})`, 0.25);
      }
    }

    const recent = sorted.filter((i) => now - i.created < 14 * DAY);
    if (recent.length >= 40) {
      const quiet = longestQuietHours(recent.map((i) => i.created));
      if (quiet < 4) add("no-sleep", `active around the clock (longest quiet stretch ${quiet}h)`, 0.3);
      else if (quiet < 6) add("no-sleep", `barely any daily break (${quiet}h quiet)`, 0.12);
    }

    const lastWeek = sorted.filter((i) => now - i.created < 7 * DAY);
    if (lastWeek.length) {
      const activeDays = new Set(lastWeek.map((i) => Math.floor(i.created / DAY))).size;
      const perDay = lastWeek.length / activeDays;
      if (perDay > 60) add("volume", `${Math.round(perDay)} posts/comments per active day`, 0.25);
      else if (perDay > 30) add("volume", `${Math.round(perDay)} posts/comments per active day`, 0.1);
    }

    if (sorted.length >= 30) {
      const subs = new Set(sorted.map((i) => i.subreddit)).size;
      if (subs / sorted.length > 0.6) add("spread", `${subs} different subreddits in ${sorted.length} items`, 0.15);
      const posts = sorted.length - comments.length;
      if (posts / sorted.length > 0.8 && subs > 15) add("reposting", "mostly posts spread over many subreddits", 0.15);
    }

    if (comments.length >= 20) {
      const lengths = comments.map((c) => c.text.length);
      const lengthCv = cv(lengths);
      if (lengthCv !== null && lengthCv < 0.35 && mean(lengths) > 80) {
        add("uniform-length", `suspiciously uniform comment length (CV ${lengthCv.toFixed(2)})`, 0.12);
      }
    }

    const bodies = comments.map((c) => normalizeBody(c.text)).filter((b) => b.length > 20);
    const dupes = bodies.length - new Set(bodies).size;
    if (dupes >= 3) add("duplicates", `${dupes} duplicate comments`, Math.min(0.2 + 0.05 * dupes, 0.5));

    if (settings.textDetection) {
      let fingerprinted = 0;
      let styled = 0;
      let eligible = 0;
      const examples = new Set();
      for (const item of sorted) {
        const r = VK.analyzeText({ text: item.text, links: VK.extractLinks(item.text), rendered: false }, settings);
        const strong = r.signals.filter((s) => s.tier !== "style" && s.weight >= 0.5);
        if (strong.length) {
          fingerprinted++;
          strong.forEach((s) => examples.add(s.id));
        }
        if ((item.text.match(/\S+/g) || []).length >= 30) {
          eligible++;
          if (r.score >= 0.3) styled++;
        }
      }
      if (fingerprinted) {
        add("history-fingerprint", `${fingerprinted} item(s) with AI fingerprints (${[...examples].slice(0, 3).join(", ")})`, Math.min(0.5 + 0.1 * (fingerprinted - 1), 0.9), "fingerprint");
      }
      if (eligible >= 10) {
        const share = styled / eligible;
        if (share >= 0.4) add("history-style", `${Math.round(share * 100)}% of longer comments read as AI-written`, 0.3, "style");
        else if (share >= 0.25) add("history-style", `${Math.round(share * 100)}% of longer comments read as AI-written`, 0.15, "style");
      }
      Object.assign(result.stats, { fingerprinted, styled, eligible });
    }

    result.score = VK.combine(signals.map((s) => s.weight));
    return result;
  };
})(globalThis.VK);
